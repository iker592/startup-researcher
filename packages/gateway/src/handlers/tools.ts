/**
 * Tool execution handlers
 */
import { dbTool } from "../tools/db";
import { webScrapeTool } from "../tools/scraper";

// Tool registry
const tools: Record<string, any> = {
  db_query: dbTool,
  web_scrape: webScrapeTool,
};

/**
 * GET /tools - List available tools
 */
export const list = async () => {
  const toolList = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    schema: tool.schema,
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toolList),
  };
};

/**
 * POST /tools/:name - Execute a tool
 */
export const execute = async (event: any) => {
  const toolName = event.pathParameters?.name;
  const tool = tools[toolName];

  if (!tool) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Tool not found: ${toolName}` }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const result = await tool.execute(body);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, result }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
