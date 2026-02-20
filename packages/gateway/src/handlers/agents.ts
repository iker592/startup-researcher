/**
 * Scheduled Agents CRUD handlers - USER-SCOPED
 * Manage user's scheduled research agents
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { getUserFromRequest } from "../utils/auth";

const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const schedulerClient = new SchedulerClient({});

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}

// Convert human-readable schedule to cron expression
function parseToCron(schedule: string): string {
  // Already a cron expression
  if (schedule.match(/^[\d\*\/\-\,]+(\s+[\d\*\/\-\,]+){4,5}$/)) {
    return schedule;
  }
  
  // Parse natural language
  const lower = schedule.toLowerCase();
  
  // Daily at HH:MM
  const dailyMatch = lower.match(/daily\s+at\s+(\d{1,2}):?(\d{2})?/);
  if (dailyMatch) {
    const hour = parseInt(dailyMatch[1]);
    const minute = dailyMatch[2] ? parseInt(dailyMatch[2]) : 0;
    return `${minute} ${hour} * * *`;
  }
  
  // Weekly on DAY at HH:MM
  const weeklyMatch = lower.match(/weekly\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}):?(\d{2})?/);
  if (weeklyMatch) {
    const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[weeklyMatch[1]];
    const hour = parseInt(weeklyMatch[2]);
    const minute = weeklyMatch[3] ? parseInt(weeklyMatch[3]) : 0;
    return `${minute} ${hour} * * ${day}`;
  }
  
  // Every N hours
  const hourlyMatch = lower.match(/every\s+(\d+)\s+hours?/);
  if (hourlyMatch) {
    const interval = parseInt(hourlyMatch[1]);
    return `0 */${interval} * * *`;
  }
  
  // Default: daily at 9am
  return '0 9 * * *';
}

/**
 * GET /agents - List user's scheduled agents
 */
export const list = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    
    const result = await dbClient.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}#AGENT` },
        ScanIndexForward: false,
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        count: result.Items?.length || 0,
        agents: result.Items || [],
      }),
    };
  } catch (error) {
    console.error("List agents error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * POST /agents - Create a scheduled agent
 */
export const create = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    const body = JSON.parse(event.body || "{}");
    
    if (!body.name || !body.prompt) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "name and prompt are required" }),
      };
    }

    const id = slugify(body.name) + '-' + Date.now().toString(36);
    const now = new Date().toISOString();
    const cronExpression = parseToCron(body.schedule || 'daily at 9');
    const scheduleName = `agent-${userId.replace(/[^a-z0-9]/g, '-')}-${id}`;

    // Create EventBridge schedule
    try {
      await schedulerClient.send(new CreateScheduleCommand({
        Name: scheduleName,
        ScheduleExpression: `cron(${cronExpression})`,
        ScheduleExpressionTimezone: body.timezone || 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' },
        State: body.enabled !== false ? 'ENABLED' : 'DISABLED',
        Target: {
          Arn: process.env.AGENT_RUNTIME_ARN || '',
          RoleArn: process.env.SCHEDULER_ROLE_ARN || '',
          Input: JSON.stringify({
            userId,
            agentId: id,
            prompt: body.prompt,
          }),
        },
      }));
    } catch (schedErr) {
      console.error("Failed to create schedule:", schedErr);
      // Continue anyway - schedule can be created later
    }

    const item = {
      pk: `USER#${userId}#AGENT#${id}`,
      sk: 'CONFIG',
      gsi1pk: `USER#${userId}#AGENT`,
      gsi1sk: now,
      id,
      userId,
      entityType: 'scheduled_agent',
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule || 'daily at 9',
      cronExpression,
      timezone: body.timezone || 'UTC',
      enabled: body.enabled !== false,
      scheduleName,
      skillIds: body.skillIds || [],
      lastRunAt: null,
      nextRunAt: null, // Could calculate from cron
      createdAt: now,
      updatedAt: now,
    };

    await dbClient.send(new PutCommand({
      TableName: Resource.ResearchData.name,
      Item: item,
    }));

    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify(item),
    };
  } catch (error) {
    console.error("Create agent error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * GET /agents/:id - Get a single agent
 */
export const get = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;

    const result = await dbClient.send(
      new GetCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * PUT /agents/:id - Update an agent
 */
export const update = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;
    const body = JSON.parse(event.body || "{}");

    // Get existing agent
    const existing = await dbClient.send(
      new GetCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
      })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const now = new Date().toISOString();
    const updates: string[] = ['#upd = :upd'];
    const names: Record<string, string> = { '#upd': 'updatedAt' };
    const values: Record<string, any> = { ':upd': now };

    if (body.name !== undefined) {
      updates.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = body.name;
    }
    if (body.prompt !== undefined) {
      updates.push('#prompt = :prompt');
      names['#prompt'] = 'prompt';
      values[':prompt'] = body.prompt;
    }
    if (body.schedule !== undefined) {
      const cronExpression = parseToCron(body.schedule);
      updates.push('#schedule = :schedule, #cron = :cron');
      names['#schedule'] = 'schedule';
      names['#cron'] = 'cronExpression';
      values[':schedule'] = body.schedule;
      values[':cron'] = cronExpression;
    }
    if (body.skillIds !== undefined) {
      updates.push('#skillIds = :skillIds');
      names['#skillIds'] = 'skillIds';
      values[':skillIds'] = body.skillIds;
    }
    if (body.enabled !== undefined) {
      updates.push('#enabled = :enabled');
      names['#enabled'] = 'enabled';
      values[':enabled'] = body.enabled;

      // Update EventBridge schedule state
      try {
        await schedulerClient.send(new UpdateScheduleCommand({
          Name: existing.Item.scheduleName,
          ScheduleExpression: `cron(${existing.Item.cronExpression})`,
          ScheduleExpressionTimezone: existing.Item.timezone,
          FlexibleTimeWindow: { Mode: 'OFF' },
          State: body.enabled ? 'ENABLED' : 'DISABLED',
          Target: {
            Arn: process.env.AGENT_RUNTIME_ARN || '',
            RoleArn: process.env.SCHEDULER_ROLE_ARN || '',
            Input: JSON.stringify({
              userId,
              agentId: id,
              prompt: body.prompt || existing.Item.prompt,
            }),
          },
        }));
      } catch (schedErr) {
        console.error("Failed to update schedule:", schedErr);
      }
    }

    const result = await dbClient.send(
      new UpdateCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(result.Attributes),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * DELETE /agents/:id - Delete an agent
 */
export const remove = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;

    // Get existing to find schedule name
    const existing = await dbClient.send(
      new GetCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
      })
    );

    if (existing.Item?.scheduleName) {
      // Delete EventBridge schedule
      try {
        await schedulerClient.send(new DeleteScheduleCommand({
          Name: existing.Item.scheduleName,
        }));
      } catch (schedErr) {
        console.error("Failed to delete schedule:", schedErr);
      }
    }

    await dbClient.send(
      new DeleteCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, id }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * POST /agents/:id/run - Manually trigger an agent run
 */
export const run = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const userId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;

    const existing = await dbClient.send(
      new GetCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: 'CONFIG',
        },
      })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const agent = existing.Item;
    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt || agent.prompt || `Research: ${agent.name}`;

    // Use the full agent runner with tools (web_search, scrape, save_doc)
    const { runAgentWithTools } = await import("./agent-runner-core");
    
    const result = await runAgentWithTools({
      id,
      name: agent.name,
      prompt,
      userId,
    });

    // Log the run
    const runId = `run_${Date.now()}`;
    await dbClient.send(
      new PutCommand({
        TableName: Resource.ResearchData.name,
        Item: {
          pk: `USER#${userId}#AGENT#${id}`,
          sk: `RUN#${runId}`,
          gsi1pk: `USER#${userId}#AGENTRUNS`,
          gsi1sk: new Date().toISOString(),
          runId,
          agentId: id,
          agentName: agent.name,
          prompt,
          result,
          status: "completed",
          createdAt: new Date().toISOString(),
        },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        runId,
        result,
      }),
    };
  } catch (error) {
    console.error("Agent run error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

// ============================================================================
// GET /agents/{id}/runs - List agent run history
// ============================================================================
export const runs = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Unauthorized" }) };

    const userId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;
    if (!id) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Agent ID required" }) };

    const result = await dbClient.send(new QueryCommand({
      TableName: Resource.ResearchData.name,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}#AGENT#${id}`,
        ":sk": "RUN#",
      },
      ScanIndexForward: false,
      Limit: 20,
    }));

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ runs: result.Items || [] }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};
