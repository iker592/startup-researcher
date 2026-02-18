/**
 * Research endpoint - Triggers agent research team
 * Uses AWS Bedrock (Claude) to scrape web, extract info, save to DB
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ToolResultContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });

const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

// Tool definitions for Bedrock
const tools: Tool[] = [
  {
    toolSpec: {
      name: "web_search",
      description: "Search the web for startup information. Returns relevant URLs and snippets.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'AI coding assistant startups 2024')",
            },
          },
          required: ["query"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "web_scrape",
      description: "Fetch and extract content from a URL.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to scrape",
            },
          },
          required: ["url"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "save_startup",
      description: "Save a researched startup to the database.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            name: { type: "string", description: "Company name" },
            description: { type: "string", description: "What the company does" },
            website: { type: "string", description: "Company website URL" },
            industries: {
              type: "array",
              items: { type: "string" },
              description: "Industry tags (e.g., ['ai', 'developer-tools'])",
            },
            foundedDate: { type: "string", description: "Year founded (e.g., '2023')" },
            headquarters: { type: "string", description: "HQ location" },
            funding: {
              type: "object",
              properties: {
                roundType: { type: "string" },
                amountUsd: { type: "number" },
                date: { type: "string" },
                investors: { type: "array", items: { type: "string" } },
              },
              description: "Latest funding round info if available",
            },
          },
          required: ["name", "description"],
        },
      },
    },
  },
];

// Simple web search using DuckDuckGo
async function webSearch(query: string): Promise<string> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StartupResearcher/1.0)" },
    });
    const html = await response.text();

    // Extract results
    const results: { title: string; url: string; snippet: string }[] = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)/g;

    let match;
    const urls: string[] = [];
    const titles: string[] = [];

    while ((match = linkRegex.exec(html)) !== null && urls.length < 5) {
      urls.push(match[1]);
      titles.push(match[2]);
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
    }

    for (let i = 0; i < urls.length; i++) {
      results.push({
        title: titles[i] || "",
        url: urls[i],
        snippet: snippets[i] || "",
      });
    }

    return JSON.stringify({ results });
  } catch (error) {
    return JSON.stringify({ error: `Search failed: ${error}` });
  }
}

// Web scrape
async function webScrape(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StartupResearcher/1.0)" },
    });
    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    return JSON.stringify({ url, title, content });
  } catch (error) {
    return JSON.stringify({ error: `Scrape failed: ${error}` });
  }
}

// Save startup to DB
async function saveStartup(data: any): Promise<string> {
  const tableName = Resource.ResearchData.name;
  const id = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const now = new Date().toISOString();

  const item = {
    pk: `STARTUP#${id}`,
    sk: "PROFILE",
    gsi1pk: "STARTUP",
    gsi1sk: data.name.toLowerCase(),
    id,
    entityType: "startup",
    name: data.name,
    description: data.description,
    website: data.website || null,
    industries: data.industries || [],
    foundedDate: data.foundedDate || null,
    headquarters: data.headquarters || null,
    status: "active",
    source: "research-agent",
    createdAt: now,
    updatedAt: now,
  };

  await dbClient.send(new PutCommand({ TableName: tableName, Item: item }));

  if (data.funding && data.funding.amountUsd) {
    const fundingItem = {
      pk: `STARTUP#${id}`,
      sk: `FUNDING#${Date.now()}`,
      gsi1pk: "FUNDING",
      gsi1sk: data.funding.date || now,
      id: Date.now().toString(),
      entityType: "funding",
      startupId: id,
      roundType: data.funding.roundType,
      amountUsd: data.funding.amountUsd,
      date: data.funding.date,
      investors: data.funding.investors || [],
      createdAt: now,
    };
    await dbClient.send(new PutCommand({ TableName: tableName, Item: fundingItem }));
  }

  return JSON.stringify({ success: true, id, name: data.name });
}

// Execute tools
async function executeTool(name: string, input: any): Promise<string> {
  console.log(`🔧 Research tool: ${name}`, JSON.stringify(input).slice(0, 200));

  if (name === "web_search") return webSearch(input.query);
  if (name === "web_scrape") return webScrape(input.url);
  if (name === "save_startup") return saveStartup(input);
  
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// Run research agent with Bedrock
async function runResearch(topic: string): Promise<{ startups: string[]; summary: string }> {
  const messages: Message[] = [
    {
      role: "user",
      content: [
        {
          text: `Research startups in this domain: "${topic}"

Find and save 3-5 relevant startups to the database. For each one, get their name, description, website, industries, and any funding info you can find.`,
        },
      ],
    },
  ];

  const systemPrompt = `You are a fast startup research agent. Find and save startups quickly.

WORKFLOW (BE FAST - max 20 seconds):
1. web_search once for startups
2. save_startup immediately for 2-3 startups from search results (don't scrape each site)
3. Done!

For each startup, provide:
- Name (required)
- Description (1-2 sentences from search snippet)
- Website URL (from search result)
- Industries (2-3 tags)

IMPORTANT: Do NOT scrape individual websites. Use info from search results only.
Save 2-3 startups maximum. Speed over completeness.`;

  const savedStartups: string[] = [];
  let iterations = 0;
  const maxIterations = 5; // Keep it fast

  let response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages,
      toolConfig: { tools },
    })
  );

  while (response.stopReason === "tool_use" && iterations < maxIterations) {
    iterations++;
    const assistantMessage = response.output?.message;
    if (assistantMessage) {
      messages.push(assistantMessage);
    }

    const toolResults: ToolResultContentBlock[] = [];
    const contentBlocks = assistantMessage?.content || [];

    for (const block of contentBlocks) {
      if (block.toolUse) {
        const { toolUseId, name, input } = block.toolUse;
        const result = await executeTool(name!, input as any);

        if (name === "save_startup") {
          const parsed = JSON.parse(result);
          if (parsed.success) {
            savedStartups.push(parsed.name);
          }
        }

        toolResults.push({
          toolResult: {
            toolUseId: toolUseId!,
            content: [{ text: result }],
          },
        });
      }
    }

    messages.push({ role: "user", content: toolResults });

    response = await bedrockClient.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: systemPrompt }],
        messages,
        toolConfig: { tools },
      })
    );
  }

  const outputContent = response.output?.message?.content || [];
  const summary = outputContent
    .filter((block) => block.text)
    .map((block) => block.text)
    .join("\n") || "Research complete.";

  return { startups: savedStartups, summary };
}

export const handler = async (event: any) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const topic = body.topic;

    if (!topic) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "topic is required" }),
      };
    }

    console.log(`🔍 Starting research: ${topic}`);
    const result = await runResearch(topic);
    console.log(`✅ Research complete: ${result.startups.length} startups saved`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        startupsFound: result.startups,
        count: result.startups.length,
        summary: result.summary,
      }),
    };
  } catch (error) {
    console.error("Research error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};
