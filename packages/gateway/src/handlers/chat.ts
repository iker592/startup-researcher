/// <reference path="../lambda-streaming.d.ts" />
/**
 * Chat endpoint - Real agent with tools + AG-UI Streaming
 * Uses AWS Bedrock (Claude) with ConverseStream
 * Uses Lambda Response Streaming for real-time SSE delivery
 * ALL DATA IS USER-SCOPED based on authenticated email
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
  ConverseStreamCommand,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import { getUserFromRequest } from "../utils/auth";

const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrockClient = new BedrockRuntimeClient({ region: "eu-west-1" });

const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

// Helper to normalize email for key consistency
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

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

// Execute tools with user scoping
async function executeTool(name: string, input: any, userId: string): Promise<string> {
  const tableName = Resource.ResearchData.name;
  const normalizedUserId = normalizeEmail(userId);

  if (name === "db_query") {
    if (input.operation === "query" && input.entity === "startup") {
      // Query only this user's startups
      const result = await dbClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :pk",
          ExpressionAttributeValues: { ":pk": `USER#${normalizedUserId}#STARTUP` },
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
      // Get only from this user's data
      const result = await dbClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: `USER#${normalizedUserId}#STARTUP#${input.id}`, sk: "PROFILE" },
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
            ":pk": `USER#${normalizedUserId}#STARTUP#${input.startupId}`,
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
        pk: `USER#${normalizedUserId}#STARTUP#${id}`,
        sk: "PROFILE",
        gsi1pk: `USER#${normalizedUserId}#STARTUP`,
        gsi1sk: (input.data.name || id).toLowerCase(),
        id,
        userId: normalizedUserId,
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
        pk: `USER#${normalizedUserId}#STARTUP#${input.startupId}`,
        sk: `FUNDING#${fundingId}`,
        gsi1pk: `USER#${normalizedUserId}#FUNDING`,
        gsi1sk: input.data.date || now,
        id: fundingId,
        userId: normalizedUserId,
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

const systemPrompt = `You are a startup research assistant. You help users query and analyze startup data from a database.

Available data:
- Startups: name, description, industries, website, status
- Funding rounds: roundType, amountUsd, date, investors, leadInvestor

When users ask about startups, use the db_query tool to fetch data.
When presenting results, format them clearly with bullet points.
Be concise but informative.`;

// AG-UI event emitter helper
function aguiEvent(type: string, data: Record<string, any> = {}): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// Main handler with Lambda Response Streaming
export const handler = awslambda.streamifyResponse(
  async (event: any, responseStream: any, _context: any) => {
    // Note: CORS headers are handled by Lambda Function URL config
    // Don't duplicate them here or browsers may reject the response
    const metadata = {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    };

    // Handle CORS preflight (Function URL handles CORS, but just in case)
    if (event.requestContext?.http?.method === "OPTIONS") {
      responseStream = awslambda.HttpResponseStream.from(responseStream, { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain" }
      });
      responseStream.end();
      return;
    }

    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);

    try {
      // Extract authenticated user
      const user = await getUserFromRequest(event);
      if (!user) {
        responseStream.write(aguiEvent("RUN_ERROR", { error: "Authentication required. Please log in." }));
        responseStream.end();
        return;
      }
      
      console.log(`🔐 Chat request from: ${user.email}`);
      
      const body = JSON.parse(event.body || "{}");
      const userMessage = body.message;

      if (!userMessage) {
        responseStream.write(aguiEvent("RUN_ERROR", { error: "message is required" }));
        responseStream.end();
        return;
      }

      const messageId = `msg-${Date.now()}`;
      
      // Emit start events
      responseStream.write(aguiEvent("RUN_STARTED", { runId: `run-${Date.now()}` }));
      responseStream.write(aguiEvent("TEXT_MESSAGE_START", { messageId }));

      const messages: Message[] = [
        { role: "user", content: [{ text: userMessage }] },
      ];

      let continueLoop = true;
      let fullResponse = "";

      while (continueLoop) {
        const streamResponse = await bedrockClient.send(
          new ConverseStreamCommand({
            modelId: MODEL_ID,
            system: [{ text: systemPrompt }],
            messages,
            toolConfig: { tools },
          })
        );

        let currentToolId = "";
        let currentToolName = "";
        let currentToolArgs = "";
        let pendingToolCalls: { id: string; name: string; args: any }[] = [];

        if (streamResponse.stream) {
          for await (const chunk of streamResponse.stream) {
            // Stream text immediately
            if (chunk.contentBlockDelta?.delta?.text) {
              const text = chunk.contentBlockDelta.delta.text;
              fullResponse += text;
              responseStream.write(aguiEvent("TEXT_MESSAGE_CONTENT", { messageId, delta: text }));
            }

            if (chunk.contentBlockStart?.start?.toolUse) {
              const toolUse = chunk.contentBlockStart.start.toolUse;
              currentToolId = toolUse.toolUseId || `tool-${Date.now()}`;
              currentToolName = toolUse.name || "";
              currentToolArgs = "";
              responseStream.write(aguiEvent("TOOL_CALL_START", { toolCallId: currentToolId, toolCallName: currentToolName }));
            }

            if (chunk.contentBlockDelta?.delta?.toolUse) {
              const argsChunk = chunk.contentBlockDelta.delta.toolUse.input || "";
              currentToolArgs += argsChunk;
              responseStream.write(aguiEvent("TOOL_CALL_ARGS", { toolCallId: currentToolId, argsChunk }));
            }

            if (chunk.contentBlockStop && currentToolId) {
              responseStream.write(aguiEvent("TOOL_CALL_END", { toolCallId: currentToolId }));
              try {
                pendingToolCalls.push({ id: currentToolId, name: currentToolName, args: JSON.parse(currentToolArgs || "{}") });
              } catch {
                pendingToolCalls.push({ id: currentToolId, name: currentToolName, args: {} });
              }
              currentToolId = "";
              currentToolName = "";
              currentToolArgs = "";
            }

            if (chunk.messageStop) {
              const stopReason = chunk.messageStop.stopReason;
              
              if (stopReason === "tool_use" && pendingToolCalls.length > 0) {
                const assistantContent: any[] = [];
                if (fullResponse) assistantContent.push({ text: fullResponse });
                for (const tc of pendingToolCalls) {
                  assistantContent.push({ toolUse: { toolUseId: tc.id, name: tc.name, input: tc.args } });
                }
                messages.push({ role: "assistant", content: assistantContent });

                const toolResultContent: any[] = [];
                for (const tc of pendingToolCalls) {
                  console.log(`🔧 Tool call: ${tc.name}`, JSON.stringify(tc.args));
                  const result = await executeTool(tc.name, tc.args, user.email);
                  console.log(`📦 Tool result:`, result.slice(0, 200));
                  
                  responseStream.write(aguiEvent("TOOL_CALL_RESULT", { toolCallId: tc.id, content: result }));
                  toolResultContent.push({ toolResult: { toolUseId: tc.id, content: [{ text: result }] } });
                }

                messages.push({ role: "user", content: toolResultContent });
                fullResponse = "";
                pendingToolCalls = [];
              } else {
                continueLoop = false;
              }
            }
          }
        }
      }

      // Emit end events
      responseStream.write(aguiEvent("TEXT_MESSAGE_END", { messageId }));
      responseStream.write(aguiEvent("RUN_FINISHED", { runId: `run-${Date.now()}` }));
      responseStream.end();

    } catch (error) {
      console.error("Chat error:", error);
      responseStream.write(aguiEvent("RUN_ERROR", { error: error instanceof Error ? error.message : "Unknown error" }));
      responseStream.end();
    }
  }
);
