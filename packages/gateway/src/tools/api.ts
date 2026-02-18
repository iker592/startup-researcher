/**
 * API Client Tool
 * Makes authenticated API calls to startup data services
 */

export interface ApiCallParams {
  service: "crunchbase" | "pitchbook" | "linkedin" | "custom";
  endpoint: string;
  method?: "GET" | "POST";
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface ApiCallResult {
  status: number;
  data: unknown;
}

// API configs from env
const API_CONFIGS = {
  crunchbase: {
    baseUrl: "https://api.crunchbase.com/api/v4",
    apiKey: process.env.CRUNCHBASE_API_KEY,
  },
  pitchbook: {
    baseUrl: "https://api.pitchbook.com/v1",
    apiKey: process.env.PITCHBOOK_API_KEY,
  },
  linkedin: {
    baseUrl: "https://api.linkedin.com/v2",
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
  },
  custom: {
    baseUrl: "",
    apiKey: "",
  },
};

export const apiTool = {
  description: "Call external APIs (Crunchbase, PitchBook, LinkedIn) for startup data",
  
  schema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["crunchbase", "pitchbook", "linkedin", "custom"],
        description: "Which API service to call"
      },
      endpoint: {
        type: "string",
        description: "API endpoint path (e.g., /organizations/search)"
      },
      method: {
        type: "string",
        enum: ["GET", "POST"],
        default: "GET"
      },
      params: {
        type: "object",
        description: "Query parameters"
      },
      body: {
        type: "object",
        description: "Request body (for POST)"
      }
    },
    required: ["service", "endpoint"]
  },
  
  async execute(params: ApiCallParams): Promise<ApiCallResult> {
    const config = API_CONFIGS[params.service];
    
    if (params.service !== "custom" && !config.apiKey && !("accessToken" in config && config.accessToken)) {
      throw new Error(`API credentials not configured for: ${params.service}`);
    }
    
    const url = new URL(params.endpoint, config.baseUrl);
    
    // Add query params
    if (params.params) {
      Object.entries(params.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    
    console.log(`📡 API call: ${params.service} ${params.method || "GET"} ${params.endpoint}`);
    
    // Build headers based on service
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (params.service === "crunchbase") {
      headers["X-cb-user-key"] = config.apiKey!;
    } else if (params.service === "linkedin") {
      headers["Authorization"] = `Bearer ${(config as any).accessToken}`;
    } else if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    
    try {
      const response = await fetch(url.toString(), {
        method: params.method || "GET",
        headers,
        body: params.body ? JSON.stringify(params.body) : undefined,
      });
      
      const data = await response.json();
      
      return {
        status: response.status,
        data,
      };
    } catch (error) {
      throw new Error(`API call failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
};
