/**
 * Chat endpoint - connects to research agent
 * 
 * This is a placeholder that shows what the agent would do.
 * Connect it to your actual agent (OpenClaw, AgentCore, etc.)
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: any) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message?.toLowerCase() || "";

    // Simple intent detection (replace with actual agent)
    let response: string;

    if (message.includes("list") || message.includes("show") || message.includes("what")) {
      // Query startups from DB
      const result = await client.send(
        new QueryCommand({
          TableName: Resource.ResearchData.name,
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :pk",
          ExpressionAttributeValues: { ":pk": "STARTUP" },
          Limit: 10,
        })
      );

      const startups = result.Items || [];
      if (startups.length === 0) {
        response = "📊 No startups in the database yet. Ask me to research some!";
      } else {
        const names = startups.map((s: any) => `• **${s.name}** - ${s.description || "No description"}`).join("\n");
        response = `📊 Found ${startups.length} startups:\n\n${names}`;
      }
    } else if (message.includes("research") || message.includes("find") || message.includes("search")) {
      response = `🔍 I would research this for you!

To enable live research, connect this endpoint to your agent (OpenClaw/AgentCore).

The agent would:
1. Call \`web_scrape\` to find relevant startups
2. Extract structured data
3. Save to DB with \`db_query\`
4. Return results

For now, try: "list startups" to see what's in the DB.`;
    } else if (message.includes("analyze") || message.includes("pattern")) {
      response = `🧠 Pattern analysis would:

1. Query all startups and funding data
2. Run analysis on:
   - Funding trajectories
   - Industry clusters
   - Team backgrounds
   - Success indicators
3. Save patterns to DB
4. Return insights

Connect your agent to enable this!`;
    } else {
      response = `I'm the Startup Research Agent! I can help with:

🔍 **Research** - "Research AI coding tools"
📊 **Query DB** - "List all startups"
🧠 **Analyze** - "Find patterns in successful startups"
💰 **Funding** - "Show recent funding rounds"

What would you like to do?`;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ response }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};
