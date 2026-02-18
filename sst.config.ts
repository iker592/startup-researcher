/// <reference path="./.sst/platform/config.d.ts" />

/**
 * 🔍 Startup Researcher - SST Config
 * 
 * AI-powered startup pattern recognition system
 * - DynamoDB for startup data
 * - AWS Bedrock (Claude) for AI agents
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
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
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

    // Direct DB operations
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

    // ════════════════════════════════════════════════════════════════
    // 🤖 AI Agent Endpoints (using AWS Bedrock)
    // ════════════════════════════════════════════════════════════════
    
    // Chat - Query agent (answers questions using DB)
    api.route("POST /chat", {
      handler: "packages/gateway/src/handlers/chat.handler",
      link: [table],
      timeout: "60 seconds",
      permissions: [
        {
          actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
          resources: ["*"],
        },
      ],
    });

    // Research - Research agent (scrapes web, saves to DB)
    api.route("POST /research", {
      handler: "packages/gateway/src/handlers/research.handler",
      link: [table],
      timeout: "120 seconds",
      permissions: [
        {
          actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
          resources: ["*"],
        },
      ],
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
