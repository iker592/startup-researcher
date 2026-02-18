/**
 * Startup CRUD handlers - USER-SCOPED
 * All data is isolated per authenticated user
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getUserFromRequest } from "../utils/auth";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
 * GET /startups - List user's startups
 */
export const list = async (event: any) => {
  try {
    // Require authentication
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const normalizedUserId = normalizeEmail(user.email);
    console.log(`📋 Listing startups for: ${user.email}`);
    
    const result = await client.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${normalizedUserId}#STARTUP` },
        Limit: 100,
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        count: result.Items?.length || 0,
        startups: result.Items || [],
      }),
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
 * POST /startups - Create a startup (user-scoped)
 */
export const create = async (event: any) => {
  try {
    // Require authentication
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const normalizedUserId = normalizeEmail(user.email);
    const body = JSON.parse(event.body || "{}");
    
    if (!body.name) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    const id = slugify(body.name);
    const now = new Date().toISOString();

    const item = {
      pk: `USER#${normalizedUserId}#STARTUP#${id}`,
      sk: "PROFILE",
      gsi1pk: `USER#${normalizedUserId}#STARTUP`,
      gsi1sk: body.name.toLowerCase(),
      id,
      userId: normalizedUserId,
      entityType: "startup",
      name: body.name,
      description: body.description || null,
      website: body.website || null,
      industries: body.industries || [],
      useCase: body.useCase || null,
      targetMarket: body.targetMarket || null,
      status: body.status || "active",
      headquarters: body.headquarters || null,
      foundedDate: body.foundedDate || null,
      employeeCount: body.employeeCount || null,
      linkedinUrl: body.linkedinUrl || null,
      twitterHandle: body.twitterHandle || null,
      createdAt: now,
      updatedAt: now,
    };

    await client.send(
      new PutCommand({
        TableName: Resource.ResearchData.name,
        Item: item,
      })
    );

    console.log(`✅ Created startup "${body.name}" for ${user.email}`);

    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify(item),
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
 * GET /startups/:id - Get a single startup (user-scoped)
 */
export const get = async (event: any) => {
  try {
    // Require authentication
    const user = await getUserFromRequest(event);
    if (!user) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Authentication required" }),
      };
    }
    
    const normalizedUserId = normalizeEmail(user.email);
    const id = event.pathParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "id is required" }),
      };
    }

    const result = await client.send(
      new GetCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${normalizedUserId}#STARTUP#${id}`,
          sk: "PROFILE",
        },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Startup not found" }),
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
