/// <reference path="./.sst/platform/config.d.ts" />

/**
 * 🔍 Startup Researcher - SST Config
 * 
 * AI-powered startup pattern recognition system
 * - DynamoDB for startup data
 * - Lambda Gateway with research tools
 * - React frontend with chat + startup browser
 * - Single-table design for flexibility
 */

export default $config({
  app(input) {
    return {
      name: "startup-researcher",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "eu-west-1",
        },
      },
    };
  },
  async run() {
    // ════════════════════════════════════════════════════════════════
    // 🗄️ Database (DynamoDB - Single Table Design)
    // ════════════════════════════════════════════════════════════════
    const table = new sst.aws.Dynamo("ResearchData", {
      fields: {
        pk: "string",  // STARTUP#name, SOURCE#id, PATTERN#id
        sk: "string",  // PROFILE, FUNDING#date, TEAM#id, META
        gsi1pk: "string", // For queries by type: STARTUP, SOURCE, etc.
        gsi1sk: "string", // For sorting: date, name, etc.
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      },
    });

    // ════════════════════════════════════════════════════════════════
    // 🔧 Research Gateway API
    // ════════════════════════════════════════════════════════════════
    const api = new sst.aws.ApiGatewayV2("ResearchApi");

    // Health check
    api.route("GET /", {
      handler: "packages/gateway/src/handlers/health.handler",
    });

    // List available tools
    api.route("GET /tools", {
      handler: "packages/gateway/src/handlers/tools.list",
    });

    // Execute tools
    api.route("POST /tools/{name}", {
      handler: "packages/gateway/src/handlers/tools.execute",
      link: [table],
      timeout: "30 seconds",
    });

    // Direct DB operations (for convenience)
    api.route("GET /startups", {
      handler: "packages/gateway/src/handlers/startups.list",
      link: [table],
    });

    api.route("POST /startups", {
      handler: "packages/gateway/src/handlers/startups.create",
      link: [table],
    });

    api.route("GET /startups/{id}", {
      handler: "packages/gateway/src/handlers/startups.get",
      link: [table],
    });

    // Chat endpoint (placeholder - connect to your agent)
    api.route("POST /chat", {
      handler: "packages/gateway/src/handlers/chat.handler",
      link: [table],
      timeout: "60 seconds",
    });

    // ════════════════════════════════════════════════════════════════
    // 🌐 Frontend (React + Vite)
    // ════════════════════════════════════════════════════════════════
    const site = new sst.aws.StaticSite("Site", {
      path: "packages/web",
      build: {
        command: "bun run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
      },
    });

    return {
      api: api.url,
      site: site.url,
      table: table.name,
    };
  },
});
