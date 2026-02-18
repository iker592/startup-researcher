/**
 * Agent Runner - Lambda-based agent execution
 * Runs Strands-style agents via Lambda instead of AgentCore Runtime
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const bedrock = new BedrockRuntimeClient({ region: "eu-west-1" });

const TABLE = Resource.ResearchDataTable.name;
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

// ============================================================================
// Tools
// ============================================================================

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any, userId: string) => Promise<string>;
}

const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web for information. Returns search results with titles, URLs, and snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      numResults: { type: "number", description: "Number of results (default: 5)" }
    },
    required: ["query"]
  },
  execute: async (input) => {
    const { query, numResults = 5 } = input;
    try {
      // Use DuckDuckGo HTML API
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchAgent/1.0)" }
      });
      const html = await resp.text();
      
      // Parse results (simplified)
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/gi;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < numResults) {
        results.push({
          url: match[1],
          title: match[2].trim(),
          snippet: match[3].trim()
        });
      }
      
      if (results.length === 0) {
        return `No results found for "${query}"`;
      }
      
      return JSON.stringify(results, null, 2);
    } catch (error) {
      return `Search failed: ${error}`;
    }
  }
};

const scrapeTool: Tool = {
  name: "scrape",
  description: "Fetch and extract text content from a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to scrape" },
      maxLength: { type: "number", description: "Max chars to return (default: 10000)" }
    },
    required: ["url"]
  },
  execute: async (input) => {
    const { url, maxLength = 10000 } = input;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchAgent/1.0)" }
      });
      const html = await resp.text();
      
      // Extract text (simplified - remove HTML tags)
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
      
      return text || "No content extracted";
    } catch (error) {
      return `Scrape failed: ${error}`;
    }
  }
};

// Note: agentId is injected at runtime via createSaveDocTool
const createSaveDocTool = (agentId: string, agentName: string): Tool => ({
  name: "save_doc",
  description: "Save a document to the database with title, tags, description, and content",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Document title" },
      tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
      description: { type: "string", description: "Brief description" },
      content: { type: "string", description: "Full content/notes" },
      sourceUrl: { type: "string", description: "Source URL if applicable" }
    },
    required: ["title", "description", "content"]
  },
  execute: async (input, userId) => {
    const { title, tags = [], description, content, sourceUrl } = input;
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    
    // Add agent name as a tag for easy filtering
    const allTags = [...new Set([...tags, agentName])];
    
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `USER#${userId}#DOC#${id}`,
        sk: "CONTENT",
        gsi1pk: `USER#${userId}#DOC`,
        gsi1sk: now,
        id,
        title,
        tags: allTags,
        description,
        content,
        sourceUrl,
        agentId,
        agentName,
        createdAt: now,
        updatedAt: now,
        type: "doc"
      }
    }));
    
    return `Document saved: "${title}" (id: ${id})`;
  }
});

const getTools = (agentId: string, agentName: string): Tool[] => [
  webSearchTool, 
  scrapeTool, 
  createSaveDocTool(agentId, agentName)
];

// ============================================================================
// Agent Runner
// ============================================================================

interface AgentConfig {
  id: string;
  name: string;
  prompt: string;
  userId: string;
}

async function runAgent(config: AgentConfig, onToken?: (token: string) => void): Promise<string> {
  const { id, name, prompt, userId } = config;
  
  // Get tools with agent context for doc saving
  const tools = getTools(id, name);
  
  const systemPrompt = `You are a research agent called "${name}". Your job is to:
1. Search the web for information on the given topic
2. Scrape relevant pages to gather details
3. Save important findings as documents

Be thorough but efficient. Save 2-5 high-quality documents per research task.
Each document should have a clear title, relevant tags, a brief description, and detailed content.

Current task: ${prompt}`;

  const messages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: [{ text: prompt }] }
  ];

  const toolConfig = {
    tools: tools.map(t => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: t.inputSchema }
      }
    }))
  };

  let iterations = 0;
  const maxIterations = 20;
  let finalResponse = "";

  while (iterations < maxIterations) {
    iterations++;
    
    try {
      const response = await bedrock.send(new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: systemPrompt }],
        messages,
        toolConfig
      }));

      const assistantContent = response.output?.message?.content || [];
      messages.push({ role: "assistant", content: assistantContent });

      // Check for tool use
      const toolUses = assistantContent.filter((c: any) => c.toolUse);
      
      if (toolUses.length === 0) {
        // No tool use - extract final text response
        const textContent = assistantContent.find((c: any) => c.text);
        finalResponse = textContent?.text || "Research complete.";
        break;
      }

      // Execute tools
      const toolResults: any[] = [];
      for (const item of toolUses) {
        const toolUse = item.toolUse;
        const tool = tools.find(t => t.name === toolUse.name);
        
        if (tool) {
          if (onToken) onToken(`\n[Using tool: ${tool.name}]\n`);
          const result = await tool.execute(toolUse.input, userId);
          toolResults.push({
            toolResult: {
              toolUseId: toolUse.toolUseId,
              content: [{ text: result }]
            }
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
      
      // Check stop reason
      if (response.stopReason === "end_turn") {
        const textContent = assistantContent.find((c: any) => c.text);
        finalResponse = textContent?.text || "Research complete.";
        break;
      }
    } catch (error) {
      finalResponse = `Agent error: ${error}`;
      break;
    }
  }

  return finalResponse;
}

// ============================================================================
// Lambda Handler
// ============================================================================

export async function handler(event: any) {
  const { agentId, userId, prompt } = JSON.parse(event.body || "{}");
  
  if (!agentId || !userId || !prompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing agentId, userId, or prompt" })
    };
  }

  // Get agent config from DynamoDB
  const agentResult = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: {
      pk: `USER#${userId}#AGENT#${agentId}`,
      sk: "CONFIG"
    }
  }));

  const agent = agentResult.Item;
  if (!agent) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Agent not found" })
    };
  }

  // Run the agent
  const result = await runAgent({
    id: agentId,
    name: agent.name,
    prompt: agent.prompt ? `${agent.prompt}\n\nSpecific task: ${prompt}` : prompt,
    userId
  });

  // Log the run
  const runId = `run_${Date.now()}`;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `USER#${userId}#AGENT#${agentId}`,
      sk: `RUN#${runId}`,
      runId,
      prompt,
      result,
      status: "completed",
      createdAt: new Date().toISOString()
    }
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ 
      success: true,
      runId,
      result 
    })
  };
}
