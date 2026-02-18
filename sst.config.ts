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
    // 🔐 Auth0 Secrets (reusing from sst-starter)
    // ════════════════════════════════════════════════════════════════
    const auth0Domain = new sst.Secret("Auth0Domain");
    const auth0ClientId = new sst.Secret("Auth0ClientId");
    const auth0ClientSecret = new sst.Secret("Auth0ClientSecret");
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
    // 🔧 Research Gateway API (for non-streaming endpoints)
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

    // Auth routes - explicit paths for reliability
    const authHandler = {
      handler: "packages/gateway/src/handlers/auth.handler",
      link: [table, auth0Domain, auth0ClientId, auth0ClientSecret],
    };
    api.route("GET /auth/authorize", authHandler);
    api.route("GET /auth/callback", authHandler);
    api.route("GET /auth/me", authHandler);
    api.route("GET /auth/logout", authHandler);

    // ════════════════════════════════════════════════════════════════
    // 🤖 AI Agent Endpoints (Lambda Function URLs for streaming)
    // ════════════════════════════════════════════════════════════════
    
    // Chat - Query agent with streaming
    const chatFn = new sst.aws.Function("ChatFunction", {
      handler: "packages/gateway/src/handlers/chat.handler",
      link: [table, auth0Domain, auth0ClientId, auth0ClientSecret],
      timeout: "5 minutes",
      memory: "1024 MB",
      url: {
        authorization: "none",
        cors: true,
      },
      permissions: [
        {
          actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
          resources: ["*"],
        },
      ],
      streaming: true,
    });

    // Research - Research agent with streaming
    const researchFn = new sst.aws.Function("ResearchFunction", {
      handler: "packages/gateway/src/handlers/research.handler",
      link: [table, auth0Domain, auth0ClientId, auth0ClientSecret],
      timeout: "10 minutes",
      memory: "1024 MB",
      url: {
        authorization: "none",
        cors: true,
      },
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
        VITE_CHAT_URL: chatFn.url,
        VITE_RESEARCH_URL: researchFn.url,
        VITE_AUTH_URL: $interpolate`${api.url}/auth`,
      },
    });

    return {
      api: api.url,
      site: site.url,
      table: table.name,
      chatUrl: chatFn.url,
      researchUrl: researchFn.url,
    };
  },
});
