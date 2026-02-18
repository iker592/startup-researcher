/**
 * Chat endpoint - Real agent with tools
 * Uses AWS Bedrock (Claude) to process queries and call tools
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
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
      name: "db_query",
      description: "Query startups from the database. Use this to list, search, or get startup information.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["query", "get"],
              description: "Operation type: query (list/search) or get (single item)",
            },
            entity: {
              type: "string",
              enum: ["startup", "funding", "pattern"],
              description: "Entity type to query",
            },
            id: {
              type: "string",
              description: "Startup ID for get operation",
            },
            limit: {
              type: "number",
              description: "Max results to return (default 20)",
            },
          },
          required: ["operation", "entity"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "db_insert",
      description: "Insert a new startup or funding round into the database.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              enum: ["startup", "funding"],
              description: "Entity type to insert",
            },
            data: {
              type: "object",
              description: "Data to insert (name, description, industries, website, etc.)",
            },
            startupId: {
              type: "string",
              description: "Parent startup ID (for funding rounds)",
            },
          },
          required: ["entity", "data"],
        },
      },
    },
  },
];

// Execute tools
async function executeTool(name: string, input: any): Promise<string> {
  const tableName = Resource.ResearchData.name;

  if (name === "db_query") {
    if (input.operation === "query" && input.entity === "startup") {
      const result = await dbClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :pk",
          ExpressionAttributeValues: { ":pk": "STARTUP" },
          Limit: input.limit || 20,
        })
      );
      const startups = (result.Items || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        industries: s.industries,
        website: s.website,
        status: s.status,
      }));
      return JSON.stringify({ count: startups.length, startups });
    }

    if (input.operation === "get" && input.id) {
      const result = await dbClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: `STARTUP#${input.id}`, sk: "PROFILE" },
        })
      );
      return JSON.stringify(result.Item || { error: "Not found" });
    }

    if (input.operation === "query" && input.entity === "funding" && input.startupId) {
      const result = await dbClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
          ExpressionAttributeValues: {
            ":pk": `STARTUP#${input.startupId}`,
            ":sk": "FUNDING#",
          },
        })
      );
      return JSON.stringify({ funding_rounds: result.Items || [] });
    }

    return JSON.stringify({ error: "Invalid query parameters" });
  }

  if (name === "db_insert") {
    const id = input.data.name
      ? input.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : Date.now().toString();
    const now = new Date().toISOString();

    if (input.entity === "startup") {
      const item = {
        pk: `STARTUP#${id}`,
        sk: "PROFILE",
        gsi1pk: "STARTUP",
        gsi1sk: (input.data.name || id).toLowerCase(),
        id,
        entityType: "startup",
        ...input.data,
        createdAt: now,
        updatedAt: now,
      };
      await dbClient.send(new PutCommand({ TableName: tableName, Item: item }));
      return JSON.stringify({ success: true, id, message: `Created startup: ${input.data.name}` });
    }

    if (input.entity === "funding" && input.startupId) {
      const fundingId = Date.now().toString();
      const item = {
        pk: `STARTUP#${input.startupId}`,
        sk: `FUNDING#${fundingId}`,
        gsi1pk: "FUNDING",
        gsi1sk: input.data.date || now,
        id: fundingId,
        entityType: "funding",
        startupId: input.startupId,
        ...input.data,
        createdAt: now,
      };
      await dbClient.send(new PutCommand({ TableName: tableName, Item: item }));
      return JSON.stringify({ success: true, id: fundingId, message: `Added funding round to ${input.startupId}` });
    }

    return JSON.stringify({ error: "Invalid insert parameters" });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// Process message with Bedrock tool loop
async function processMessage(userMessage: string): Promise<string> {
  const messages: Message[] = [
    { role: "user", content: [{ text: userMessage }] },
  ];

  const systemPrompt = `You are a startup research assistant. You help users query and analyze startup data from a database.

Available data:
- Startups: name, description, industries, website, status
- Funding rounds: roundType, amountUsd, date, investors, leadInvestor

When users ask about startups, use the db_query tool to fetch data.
When presenting results, format them clearly with bullet points.
Be concise but informative.`;

  let response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages,
      toolConfig: { tools },
    })
  );

  // Tool use loop
  while (response.stopReason === "tool_use") {
    const assistantMessage = response.output?.message;
    if (assistantMessage) {
      messages.push(assistantMessage);
    }

    // Execute tool calls
    const toolResults: ToolResultContentBlock[] = [];
    const contentBlocks = assistantMessage?.content || [];
    
    for (const block of contentBlocks) {
      if (block.toolUse) {
        const { toolUseId, name, input } = block.toolUse;
        console.log(`🔧 Tool call: ${name}`, JSON.stringify(input));
        const result = await executeTool(name!, input as any);
        console.log(`📦 Tool result:`, result.slice(0, 200));
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

  // Extract text response
  const outputContent = response.output?.message?.content || [];
  const textParts = outputContent
    .filter((block) => block.text)
    .map((block) => block.text);
  
  return textParts.join("\n") || "I processed your request.";
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
    const message = body.message;

    if (!message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "message is required" }),
      };
    }

    const response = await processMessage(message);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ response }),
    };
  } catch (error) {
    console.error("Chat error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};
