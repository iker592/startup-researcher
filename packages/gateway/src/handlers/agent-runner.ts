/**
 * Agent Runner Lambda - Function URL endpoint
 * Bypasses API Gateway 30s timeout for long-running agent tasks
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { getUserFromRequest } from "../utils/auth";
import { runAgentWithTools } from "./agent-runner-core";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = Resource.ResearchData.name;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function handler(event: any) {
  // CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  try {
    // Auth
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }

    const userId = normalizeEmail(user.email);
    const body = JSON.parse(event.body || "{}");
    const { agentId } = body;

    if (!agentId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "agentId is required" }),
      };
    }

    // Get agent config
    const agentResult = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: {
        pk: `USER#${userId}#AGENT#${agentId}`,
        sk: "CONFIG",
      },
    }));

    if (!agentResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const agent = agentResult.Item;
    const prompt = body.prompt || agent.prompt || `Research: ${agent.name}`;

    console.log(`[AgentRunner] Running agent "${agent.name}" for user ${userId}`);

    // Run the full agent with tools
    const result = await runAgentWithTools({
      id: agentId,
      name: agent.name,
      prompt,
      userId,
    });

    // Log the run
    const runId = `run_${Date.now()}`;
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `USER#${userId}#AGENT#${agentId}`,
        sk: `RUN#${runId}`,
        gsi1pk: `USER#${userId}#AGENTRUNS`,
        gsi1sk: new Date().toISOString(),
        runId,
        agentId,
        agentName: agent.name,
        prompt,
        result,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    }));

    console.log(`[AgentRunner] Agent "${agent.name}" completed`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, runId, result }),
    };
  } catch (error) {
    console.error("[AgentRunner] Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
}
