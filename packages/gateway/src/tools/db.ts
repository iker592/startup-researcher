/**
 * Database Tool
 * CRUD operations on the startup research database
 */

import { Pool } from "pg";

export interface DbQueryParams {
  operation: "insert" | "update" | "query" | "delete";
  table: "startups" | "funding_rounds" | "team_members" | "sources" | "analysis";
  data?: Record<string, unknown>;
  where?: Record<string, unknown>;
  select?: string[];
  limit?: number;
  orderBy?: string;
}

export interface DbQueryResult {
  operation: string;
  rowCount: number;
  rows: Record<string, unknown>[];
}

// Initialize pool (lazy)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/startup_researcher",
    });
  }
  return pool;
}

export const dbTool = {
  description: "Query and modify the startup research database",
  
  schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["insert", "update", "query", "delete"],
        description: "Database operation type"
      },
      table: {
        type: "string",
        enum: ["startups", "funding_rounds", "team_members", "sources", "analysis"],
        description: "Table to operate on"
      },
      data: {
        type: "object",
        description: "Data to insert/update"
      },
      where: {
        type: "object",
        description: "WHERE clause conditions"
      },
      select: {
        type: "array",
        items: { type: "string" },
        description: "Columns to select (query only)"
      },
      limit: {
        type: "number",
        description: "Max rows to return"
      },
      orderBy: {
        type: "string",
        description: "ORDER BY clause"
      }
    },
    required: ["operation", "table"]
  },
  
  async execute(params: DbQueryParams): Promise<DbQueryResult> {
    const db = getPool();
    
    console.log(`💾 DB ${params.operation}: ${params.table}`);
    
    try {
      switch (params.operation) {
        case "query": {
          const cols = params.select?.join(", ") || "*";
          let sql = `SELECT ${cols} FROM ${params.table}`;
          const values: unknown[] = [];
          
          if (params.where) {
            const conditions = Object.entries(params.where).map(([key, _], i) => {
              values.push(params.where![key]);
              return `${key} = $${i + 1}`;
            });
            sql += ` WHERE ${conditions.join(" AND ")}`;
          }
          
          if (params.orderBy) {
            sql += ` ORDER BY ${params.orderBy}`;
          }
          
          if (params.limit) {
            sql += ` LIMIT ${params.limit}`;
          }
          
          const result = await db.query(sql, values);
          return {
            operation: "query",
            rowCount: result.rowCount || 0,
            rows: result.rows,
          };
        }
        
        case "insert": {
          if (!params.data) throw new Error("Insert requires data");
          
          const cols = Object.keys(params.data);
          const values = Object.values(params.data);
          const placeholders = cols.map((_, i) => `$${i + 1}`);
          
          const sql = `INSERT INTO ${params.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
          const result = await db.query(sql, values);
          
          return {
            operation: "insert",
            rowCount: result.rowCount || 0,
            rows: result.rows,
          };
        }
        
        case "update": {
          if (!params.data) throw new Error("Update requires data");
          if (!params.where) throw new Error("Update requires where clause");
          
          const setCols = Object.keys(params.data);
          const whereCols = Object.keys(params.where);
          const values = [...Object.values(params.data), ...Object.values(params.where)];
          
          const setClause = setCols.map((col, i) => `${col} = $${i + 1}`).join(", ");
          const whereClause = whereCols.map((col, i) => `${col} = $${setCols.length + i + 1}`).join(" AND ");
          
          const sql = `UPDATE ${params.table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
          const result = await db.query(sql, values);
          
          return {
            operation: "update",
            rowCount: result.rowCount || 0,
            rows: result.rows,
          };
        }
        
        case "delete": {
          if (!params.where) throw new Error("Delete requires where clause");
          
          const whereCols = Object.keys(params.where);
          const values = Object.values(params.where);
          const whereClause = whereCols.map((col, i) => `${col} = $${i + 1}`).join(" AND ");
          
          const sql = `DELETE FROM ${params.table} WHERE ${whereClause} RETURNING *`;
          const result = await db.query(sql, values);
          
          return {
            operation: "delete",
            rowCount: result.rowCount || 0,
            rows: result.rows,
          };
        }
        
        default:
          throw new Error(`Unknown operation: ${params.operation}`);
      }
    } catch (error) {
      throw new Error(`DB operation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
};
