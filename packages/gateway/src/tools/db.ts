/**
 * Database Tool - DynamoDB Operations
 * Single-table design for startup research data
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

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface DbQueryParams {
  operation: "insert" | "update" | "query" | "get" | "delete";
  entity: "startup" | "funding" | "team" | "source" | "analysis" | "pattern";
  id?: string;
  data?: Record<string, unknown>;
  startupId?: string; // For related entities
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface DbQueryResult {
  operation: string;
  count: number;
  items: Record<string, unknown>[];
}

// Entity key patterns
const keyPatterns = {
  startup: {
    pk: (id: string) => `STARTUP#${id}`,
    sk: () => "PROFILE",
    gsi1pk: () => "STARTUP",
    gsi1sk: (name: string) => name.toLowerCase(),
  },
  funding: {
    pk: (startupId: string) => `STARTUP#${startupId}`,
    sk: (id: string) => `FUNDING#${id}`,
    gsi1pk: () => "FUNDING",
    gsi1sk: (date: string) => date,
  },
  team: {
    pk: (startupId: string) => `STARTUP#${startupId}`,
    sk: (id: string) => `TEAM#${id}`,
    gsi1pk: () => "TEAM",
    gsi1sk: (name: string) => name.toLowerCase(),
  },
  source: {
    pk: (id: string) => `SOURCE#${id}`,
    sk: () => "META",
    gsi1pk: (type: string) => `SOURCE#${type}`,
    gsi1sk: (date: string) => date,
  },
  analysis: {
    pk: (startupId: string) => `STARTUP#${startupId}`,
    sk: (id: string) => `ANALYSIS#${id}`,
    gsi1pk: (type: string) => `ANALYSIS#${type}`,
    gsi1sk: (date: string) => date,
  },
  pattern: {
    pk: (id: string) => `PATTERN#${id}`,
    sk: () => "META",
    gsi1pk: (category: string) => `PATTERN#${category}`,
    gsi1sk: (name: string) => name.toLowerCase(),
  },
};

// Generate slug from name
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const dbTool = {
  description: "Query and modify the startup research database (DynamoDB)",

  schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["insert", "update", "query", "get", "delete"],
        description: "Database operation type",
      },
      entity: {
        type: "string",
        enum: ["startup", "funding", "team", "source", "analysis", "pattern"],
        description: "Entity type to operate on",
      },
      id: {
        type: "string",
        description: "Entity ID (for get/update/delete)",
      },
      data: {
        type: "object",
        description: "Data to insert/update",
      },
      startupId: {
        type: "string",
        description: "Parent startup ID (for funding/team/analysis)",
      },
      limit: {
        type: "number",
        description: "Max items to return (query)",
      },
    },
    required: ["operation", "entity"],
  },

  async execute(params: DbQueryParams): Promise<DbQueryResult> {
    const tableName = Resource.ResearchData.name;
    console.log(`💾 DB ${params.operation}: ${params.entity}`);

    try {
      switch (params.operation) {
        // ════════════════════════════════════════════════════════════
        // INSERT
        // ════════════════════════════════════════════════════════════
        case "insert": {
          if (!params.data) throw new Error("Insert requires data");

          const id = params.id || slugify((params.data.name as string) || Date.now().toString());
          const now = new Date().toISOString();
          const keys = keyPatterns[params.entity];

          let item: Record<string, unknown> = {
            ...params.data,
            id,
            entityType: params.entity,
            createdAt: now,
            updatedAt: now,
          };

          // Set keys based on entity type
          if (params.entity === "startup") {
            item.pk = keys.pk(id);
            item.sk = keys.sk();
            item.gsi1pk = keys.gsi1pk();
            item.gsi1sk = keys.gsi1sk(params.data.name as string || id);
          } else if (["funding", "team", "analysis"].includes(params.entity)) {
            if (!params.startupId) throw new Error(`${params.entity} requires startupId`);
            item.pk = keys.pk(params.startupId);
            item.sk = keys.sk(id);
            item.gsi1pk = keys.gsi1pk();
            item.gsi1sk = keys.gsi1sk(params.data.date as string || now);
            item.startupId = params.startupId;
          } else if (params.entity === "source") {
            item.pk = keys.pk(id);
            item.sk = keys.sk();
            item.gsi1pk = keys.gsi1pk(params.data.sourceType as string || "unknown");
            item.gsi1sk = keys.gsi1sk(params.data.publishedAt as string || now);
          } else if (params.entity === "pattern") {
            item.pk = keys.pk(id);
            item.sk = keys.sk();
            item.gsi1pk = keys.gsi1pk(params.data.category as string || "general");
            item.gsi1sk = keys.gsi1sk(params.data.name as string || id);
          }

          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: item,
            })
          );

          return { operation: "insert", count: 1, items: [item] };
        }

        // ════════════════════════════════════════════════════════════
        // QUERY - List entities
        // ════════════════════════════════════════════════════════════
        case "query": {
          let result;

          if (params.entity === "startup") {
            // Query all startups via GSI
            result = await client.send(
              new QueryCommand({
                TableName: tableName,
                IndexName: "gsi1",
                KeyConditionExpression: "gsi1pk = :pk",
                ExpressionAttributeValues: { ":pk": "STARTUP" },
                Limit: params.limit || 100,
              })
            );
          } else if (params.startupId && ["funding", "team", "analysis"].includes(params.entity)) {
            // Query entities for a specific startup
            const prefix = params.entity.toUpperCase();
            result = await client.send(
              new QueryCommand({
                TableName: tableName,
                KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
                ExpressionAttributeValues: {
                  ":pk": `STARTUP#${params.startupId}`,
                  ":sk": `${prefix}#`,
                },
                Limit: params.limit || 100,
              })
            );
          } else {
            // Query by entity type GSI
            const gsi1pk = params.entity === "source" 
              ? `SOURCE#${params.filters?.sourceType || "article"}`
              : params.entity === "pattern"
              ? `PATTERN#${params.filters?.category || "success_factor"}`
              : params.entity.toUpperCase();
              
            result = await client.send(
              new QueryCommand({
                TableName: tableName,
                IndexName: "gsi1",
                KeyConditionExpression: "gsi1pk = :pk",
                ExpressionAttributeValues: { ":pk": gsi1pk },
                Limit: params.limit || 100,
              })
            );
          }

          return {
            operation: "query",
            count: result.Items?.length || 0,
            items: result.Items || [],
          };
        }

        // ════════════════════════════════════════════════════════════
        // GET - Single entity
        // ════════════════════════════════════════════════════════════
        case "get": {
          if (!params.id) throw new Error("Get requires id");

          const keys = keyPatterns[params.entity];
          let pk: string, sk: string;

          if (params.entity === "startup") {
            pk = keys.pk(params.id);
            sk = keys.sk();
          } else if (["funding", "team", "analysis"].includes(params.entity)) {
            if (!params.startupId) throw new Error(`Get ${params.entity} requires startupId`);
            pk = keys.pk(params.startupId);
            sk = keys.sk(params.id);
          } else {
            pk = keys.pk(params.id);
            sk = keys.sk();
          }

          const result = await client.send(
            new GetCommand({
              TableName: tableName,
              Key: { pk, sk },
            })
          );

          return {
            operation: "get",
            count: result.Item ? 1 : 0,
            items: result.Item ? [result.Item] : [],
          };
        }

        // ════════════════════════════════════════════════════════════
        // UPDATE
        // ════════════════════════════════════════════════════════════
        case "update": {
          if (!params.id) throw new Error("Update requires id");
          if (!params.data) throw new Error("Update requires data");

          const keys = keyPatterns[params.entity];
          let pk: string, sk: string;

          if (params.entity === "startup") {
            pk = keys.pk(params.id);
            sk = keys.sk();
          } else if (["funding", "team", "analysis"].includes(params.entity)) {
            if (!params.startupId) throw new Error(`Update ${params.entity} requires startupId`);
            pk = keys.pk(params.startupId);
            sk = keys.sk(params.id);
          } else {
            pk = keys.pk(params.id);
            sk = keys.sk();
          }

          // Build update expression
          const updateFields = Object.keys(params.data).filter(k => !["pk", "sk"].includes(k));
          const updateExpr = "SET " + updateFields.map((k, i) => `#f${i} = :v${i}`).join(", ") + ", #upd = :upd";
          const exprNames: Record<string, string> = { "#upd": "updatedAt" };
          const exprValues: Record<string, unknown> = { ":upd": new Date().toISOString() };
          
          updateFields.forEach((k, i) => {
            exprNames[`#f${i}`] = k;
            exprValues[`:v${i}`] = params.data![k];
          });

          const result = await client.send(
            new UpdateCommand({
              TableName: tableName,
              Key: { pk, sk },
              UpdateExpression: updateExpr,
              ExpressionAttributeNames: exprNames,
              ExpressionAttributeValues: exprValues,
              ReturnValues: "ALL_NEW",
            })
          );

          return {
            operation: "update",
            count: 1,
            items: result.Attributes ? [result.Attributes] : [],
          };
        }

        // ════════════════════════════════════════════════════════════
        // DELETE
        // ════════════════════════════════════════════════════════════
        case "delete": {
          if (!params.id) throw new Error("Delete requires id");

          const keys = keyPatterns[params.entity];
          let pk: string, sk: string;

          if (params.entity === "startup") {
            pk = keys.pk(params.id);
            sk = keys.sk();
          } else if (["funding", "team", "analysis"].includes(params.entity)) {
            if (!params.startupId) throw new Error(`Delete ${params.entity} requires startupId`);
            pk = keys.pk(params.startupId);
            sk = keys.sk(params.id);
          } else {
            pk = keys.pk(params.id);
            sk = keys.sk();
          }

          await client.send(
            new DeleteCommand({
              TableName: tableName,
              Key: { pk, sk },
            })
          );

          return { operation: "delete", count: 1, items: [] };
        }

        default:
          throw new Error(`Unknown operation: ${params.operation}`);
      }
    } catch (error) {
      throw new Error(`DB operation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};
