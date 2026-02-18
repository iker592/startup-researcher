/**
 * Startup CRUD handlers
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}

/**
 * GET /startups - List all startups
 */
export const list = async () => {
  try {
    const result = await client.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "STARTUP" },
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
 * POST /startups - Create a startup
 */
export const create = async (event: any) => {
  try {
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
      pk: `STARTUP#${id}`,
      sk: "PROFILE",
      gsi1pk: "STARTUP",
      gsi1sk: body.name.toLowerCase(),
      id,
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
 * GET /startups/:id - Get a single startup
 */
export const get = async (event: any) => {
  try {
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
          pk: `STARTUP#${id}`,
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
