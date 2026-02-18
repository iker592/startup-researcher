/**
 * Docs CRUD handlers - USER-SCOPED
 * Generic document storage for research results
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getUserFromRequest } from "../utils/auth";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
 * GET /docs - List user's documents
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
    const limit = parseInt(event.queryStringParameters?.limit || "50");
    const tag = event.queryStringParameters?.tag;
    const agentId = event.queryStringParameters?.agentId;
    
    const result = await client.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}#DOC` },
        ScanIndexForward: false, // Newest first
        Limit: limit,
      })
    );

    let docs = result.Items || [];
    
    // Filter by agentId if specified
    if (agentId) {
      docs = docs.filter((doc: any) => doc.agentId === agentId);
    }
    
    // Filter by tag if specified
    if (tag) {
      docs = docs.filter((doc: any) => 
        doc.tags?.includes(tag.toLowerCase())
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        count: docs.length,
        docs,
      }),
    };
  } catch (error) {
    console.error("List docs error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
    };
  }
};

/**
 * GET /docs/:id - Get a single document
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
          pk: `USER#${userId}#DOC#${id}`,
          sk: "CONTENT",
        },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Document not found" }),
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
 * DELETE /docs/:id - Delete a document
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

    if (!id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "id is required" }),
      };
    }

    await client.send(
      new DeleteCommand({
        TableName: Resource.ResearchData.name,
        Key: {
          pk: `USER#${userId}#DOC#${id}`,
          sk: "CONTENT",
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
 * GET /docs/tags - Get all unique tags for user
 */
export const tags = async (event: any) => {
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
    
    const result = await client.send(
      new QueryCommand({
        TableName: Resource.ResearchData.name,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}#DOC` },
        ProjectionExpression: "tags",
      })
    );

    // Collect unique tags
    const tagSet = new Set<string>();
    for (const item of result.Items || []) {
      for (const tag of item.tags || []) {
        tagSet.add(tag);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        tags: Array.from(tagSet).sort(),
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
