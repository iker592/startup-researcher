import { Elysia } from "elysia";
import { emailTool } from "./tools/email";
import { webScrapeTool } from "./tools/scraper";
import { apiTool } from "./tools/api";
import { dbTool } from "./tools/db";
import { paperTool } from "./tools/papers";

// Tool registry
const tools = {
  email_fetch: emailTool,
  web_scrape: webScrapeTool,
  api_call: apiTool,
  db_query: dbTool,
  paper_fetch: paperTool,
};

type ToolName = keyof typeof tools;

const app = new Elysia()
  .get("/", () => ({
    name: "Startup Researcher Gateway",
    version: "0.1.0",
    tools: Object.keys(tools),
  }))
  
  // List available tools
  .get("/tools", () => {
    return Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      schema: tool.schema,
    }));
  })
  
  // Execute a tool
  .post("/tools/:name", async ({ params, body }) => {
    const toolName = params.name as ToolName;
    const tool = tools[toolName];
    
    if (!tool) {
      return { error: `Tool not found: ${toolName}` };
    }
    
    try {
      const result = await tool.execute(body as any);
      return { success: true, result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  })
  
  // Health check
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  
  .listen(3002);

console.log(`🚀 Startup Researcher Gateway running at http://localhost:${app.server?.port}`);
console.log(`📦 Available tools: ${Object.keys(tools).join(", ")}`);

export type App = typeof app;
