/// <reference path="./.sst/platform/config.d.ts" />

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
    // 🔐 Auth0 Secrets
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

    const authSecrets = [table, auth0Domain, auth0ClientId, auth0ClientSecret];

    // ════════════════════════════════════════════════════════════════
    // 🔧 API Gateway
    // ════════════════════════════════════════════════════════════════
    const api = new sst.aws.ApiGatewayV2("ResearchApi");

    api.route("GET /", {
      handler: "packages/gateway/src/handlers/health.handler",
    });
    api.route("GET /tools", {
      handler: "packages/gateway/src/handlers/tools.list",
    });
    api.route("POST /tools/{name}", {
      handler: "packages/gateway/src/handlers/tools.execute",
      link: [table],
      timeout: "30 seconds",
    });

    // Startups
    api.route("GET /startups", { handler: "packages/gateway/src/handlers/startups.list", link: authSecrets });
    api.route("POST /startups", { handler: "packages/gateway/src/handlers/startups.create", link: authSecrets });
    api.route("GET /startups/{id}", { handler: "packages/gateway/src/handlers/startups.get", link: authSecrets });

    // Auth
    const authHandler = { handler: "packages/gateway/src/handlers/auth.handler", link: authSecrets };
    api.route("GET /auth/authorize", authHandler);
    api.route("GET /auth/callback", authHandler);
    api.route("GET /auth/me", authHandler);
    api.route("GET /auth/logout", authHandler);

    // Docs
    const docsHandler = { link: authSecrets };
    api.route("GET /docs", { handler: "packages/gateway/src/handlers/docs.list", ...docsHandler });
    api.route("GET /docs/tags", { handler: "packages/gateway/src/handlers/docs.tags", ...docsHandler });
    api.route("GET /docs/{id}", { handler: "packages/gateway/src/handlers/docs.get", ...docsHandler });
    api.route("DELETE /docs/{id}", { handler: "packages/gateway/src/handlers/docs.remove", ...docsHandler });

    // Skills
    api.route("GET /skills", { handler: "packages/gateway/src/handlers/skills.list", link: authSecrets });
    api.route("POST /skills", { handler: "packages/gateway/src/handlers/skills.create", link: authSecrets });
    api.route("GET /skills/{id}", { handler: "packages/gateway/src/handlers/skills.get", link: authSecrets });
    api.route("PUT /skills/{id}", { handler: "packages/gateway/src/handlers/skills.update", link: authSecrets });
    api.route("DELETE /skills/{id}", { handler: "packages/gateway/src/handlers/skills.remove", link: authSecrets });

    // ════════════════════════════════════════════════════════════════
    // 🤖 AI Agent Endpoints (Function URLs for long-running tasks)
    // ════════════════════════════════════════════════════════════════
    const chatFn = new sst.aws.Function("ChatFunction", {
      handler: "packages/gateway/src/handlers/chat.handler",
      link: authSecrets,
      timeout: "5 minutes",
      memory: "1024 MB",
      url: { authorization: "none", cors: true },
      permissions: [{ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] }],
      streaming: true,
    });

    const researchFn = new sst.aws.Function("ResearchFunction", {
      handler: "packages/gateway/src/handlers/research.handler",
      link: authSecrets,
      timeout: "10 minutes",
      memory: "1024 MB",
      url: { authorization: "none", cors: true },
      permissions: [{ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] }],
    });

    const agentRunnerFn = new sst.aws.Function("AgentRunnerFunction", {
      handler: "packages/gateway/src/handlers/agent-runner.handler",
      link: authSecrets,
      timeout: "10 minutes",
      memory: "1024 MB",
      url: { authorization: "none", cors: true },
      permissions: [{ actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] }],
    });

    // ════════════════════════════════════════════════════════════════
    // 📅 EventBridge Scheduler Role
    // ════════════════════════════════════════════════════════════════
    const schedulerRole = new aws.iam.Role("SchedulerRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "scheduler.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    });

    new aws.iam.RolePolicy("SchedulerInvokePolicy", {
      role: schedulerRole.id,
      policy: agentRunnerFn.nodes.function.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: ["lambda:InvokeFunction"], Resource: [arn] }],
      })),
    });

    // ════════════════════════════════════════════════════════════════
    // 🤖 Scheduled Agents API
    // ════════════════════════════════════════════════════════════════
    const agentsHandler = {
      link: authSecrets,
      timeout: "5 minutes",
      memory: "1024 MB",
      environment: {
        AGENT_RUNTIME_ARN: agentRunnerFn.nodes.function.arn,
        SCHEDULER_ROLE_ARN: schedulerRole.arn,
      },
      permissions: [
        { actions: ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"], resources: ["*"] },
        { actions: ["iam:PassRole"], resources: ["*"] },
        { actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: ["*"] },
      ],
    };
    api.route("GET /agents", { handler: "packages/gateway/src/handlers/agents.list", ...agentsHandler });
    api.route("POST /agents", { handler: "packages/gateway/src/handlers/agents.create", ...agentsHandler });
    api.route("GET /agents/{id}", { handler: "packages/gateway/src/handlers/agents.get", ...agentsHandler });
    api.route("PUT /agents/{id}", { handler: "packages/gateway/src/handlers/agents.update", ...agentsHandler });
    api.route("DELETE /agents/{id}", { handler: "packages/gateway/src/handlers/agents.remove", ...agentsHandler });
    api.route("POST /agents/{id}/run", { handler: "packages/gateway/src/handlers/agents.run", ...agentsHandler });
    api.route("GET /agents/{id}/runs", { handler: "packages/gateway/src/handlers/agents.runs", ...agentsHandler });

    // ════════════════════════════════════════════════════════════════
    // 🌐 Frontend
    // ════════════════════════════════════════════════════════════════
    const site = new sst.aws.StaticSite("Site", {
      path: "packages/web",
      build: { command: "bun run build", output: "dist" },
      environment: {
        VITE_API_URL: api.url,
        VITE_CHAT_URL: chatFn.url,
        VITE_RESEARCH_URL: researchFn.url,
        VITE_AGENT_RUNNER_URL: agentRunnerFn.url,
        VITE_AUTH_URL: $interpolate`${api.url}/auth`,
      },
    });

    return {
      api: api.url,
      site: site.url,
      table: table.name,
      chatUrl: chatFn.url,
      researchUrl: researchFn.url,
      agentRunnerUrl: agentRunnerFn.url,
    };
  },
});
