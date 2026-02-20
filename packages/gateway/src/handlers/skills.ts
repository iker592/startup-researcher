/**
 * Skills CRUD handlers - USER-SCOPED
 * Manage user's AI agent skills (following Anthropic's Agent Skills structure)
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
import { getUserFromRequest } from "../utils/auth";

const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}

/**
 * GET /skills - List user's skills
 */
export const list = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Authentication required" }) };
    }

    const userId = normalizeEmail(user.email);
    const result = await dbClient.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}#SKILL` },
        ScanIndexForward: false,
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ count: result.Items?.length || 0, skills: result.Items || [] }),
    };
  } catch (error) {
    console.error("List skills error:", error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(error) }) };
  }
};

/**
 * POST /skills - Create a skill
 */
export const create = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Authentication required" }) };
    }

    const userId = normalizeEmail(user.email);
    const body = JSON.parse(event.body || "{}");
    const { name, description, instructions, tags, invocation, resources } = body;

    if (!name?.trim() || !instructions?.trim()) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "name and instructions are required" }) };
    }

    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const item = {
      pk: `SKILL#${id}`,
      sk: `SKILL#${id}`,
      gsi1pk: `USER#${userId}#SKILL`,
      gsi1sk: now,
      id,
      userId,
      name: name.trim(),
      description: description?.trim() || "",
      instructions: instructions.trim(),
      tags: tags || [],
      invocation: invocation || "auto", // auto | user | agent
      resources: resources || [],
      createdAt: now,
      updatedAt: now,
    };

    await dbClient.send(new PutCommand({ TableName: Resource.ResearchData.name, Item: item }));

    return { statusCode: 201, headers: corsHeaders(), body: JSON.stringify(item) };
  } catch (error) {
    console.error("Create skill error:", error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(error) }) };
  }
};

/**
 * GET /skills/{id} - Get a skill
 */
export const get = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Authentication required" }) };
    }

    const id = event.pathParameters?.id;
    const result = await dbClient.send(
      new GetCommand({ TableName: Resource.ResearchData.name, Key: { pk: `SKILL#${id}`, sk: `SKILL#${id}` } })
    );

    if (!result.Item || result.Item.userId !== normalizeEmail(user.email)) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Skill not found" }) };
    }

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(result.Item) };
  } catch (error) {
    console.error("Get skill error:", error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(error) }) };
  }
};

/**
 * PUT /skills/{id} - Update a skill
 */
export const update = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Authentication required" }) };
    }

    const id = event.pathParameters?.id;
    const userId = normalizeEmail(user.email);

    // Verify ownership
    const existing = await dbClient.send(
      new GetCommand({ TableName: Resource.ResearchData.name, Key: { pk: `SKILL#${id}`, sk: `SKILL#${id}` } })
    );
    if (!existing.Item || existing.Item.userId !== userId) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Skill not found" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const now = new Date().toISOString();

    const updates: string[] = ["#updatedAt = :updatedAt"];
    const names: Record<string, string> = { "#updatedAt": "updatedAt" };
    const values: Record<string, any> = { ":updatedAt": now };

    const allowedFields = ["name", "description", "instructions", "tags", "invocation", "resources"];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`#${field} = :${field}`);
        names[`#${field}`] = field;
        values[`:${field}`] = body[field];
      }
    }

    const result = await dbClient.send(
      new UpdateCommand({
        TableName: Resource.ResearchData.name,
        Key: { pk: `SKILL#${id}`, sk: `SKILL#${id}` },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(result.Attributes) };
  } catch (error) {
    console.error("Update skill error:", error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(error) }) };
  }
};

/**
 * DELETE /skills/{id} - Delete a skill
 */
export const remove = async (event: any) => {
  try {
    const user = await getUserFromRequest(event);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Authentication required" }) };
    }

    const id = event.pathParameters?.id;
    const userId = normalizeEmail(user.email);

    // Verify ownership
    const existing = await dbClient.send(
      new GetCommand({ TableName: Resource.ResearchData.name, Key: { pk: `SKILL#${id}`, sk: `SKILL#${id}` } })
    );
    if (!existing.Item || existing.Item.userId !== userId) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: "Skill not found" }) };
    }

    await dbClient.send(
      new DeleteCommand({ TableName: Resource.ResearchData.name, Key: { pk: `SKILL#${id}`, sk: `SKILL#${id}` } })
    );

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ success: true, id }) };
  } catch (error) {
    console.error("Delete skill error:", error);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(error) }) };
  }
};
