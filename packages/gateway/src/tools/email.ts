/**
 * Email Fetcher Tool
 * Connects to IMAP mailboxes and fetches emails matching criteria
 */

export interface EmailFetchParams {
  source: "berkeley" | "personal";
  query?: string;
  since?: string; // ISO date
  limit?: number;
  folder?: string;
}

export interface EmailResult {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  links: string[];
}

// IMAP configs loaded from env
const IMAP_CONFIGS = {
  berkeley: {
    host: process.env.BERKELEY_IMAP_HOST || "imap.gmail.com",
    port: 993,
    user: process.env.BERKELEY_EMAIL,
    password: process.env.BERKELEY_PASSWORD,
  },
  personal: {
    host: process.env.PERSONAL_IMAP_HOST || "imap.gmail.com", 
    port: 993,
    user: process.env.PERSONAL_EMAIL,
    password: process.env.PERSONAL_PASSWORD,
  },
};

export const emailTool = {
  description: "Fetch emails from configured mailboxes (Berkeley inbox, personal)",
  
  schema: {
    type: "object",
    properties: {
      source: { 
        type: "string", 
        enum: ["berkeley", "personal"],
        description: "Which mailbox to fetch from"
      },
      query: { 
        type: "string",
        description: "Search query (subject/body keywords)"
      },
      since: { 
        type: "string",
        description: "Fetch emails since this date (ISO format)"
      },
      limit: { 
        type: "number",
        description: "Max emails to return",
        default: 20
      },
      folder: {
        type: "string", 
        description: "Mailbox folder (default: INBOX)",
        default: "INBOX"
      }
    },
    required: ["source"]
  },
  
  async execute(params: EmailFetchParams): Promise<EmailResult[]> {
    const config = IMAP_CONFIGS[params.source];
    
    if (!config.user || !config.password) {
      throw new Error(`Email credentials not configured for: ${params.source}`);
    }
    
    // TODO: Implement actual IMAP fetching
    // For now, return mock data for testing
    console.log(`📧 Fetching emails from ${params.source}...`);
    console.log(`   Query: ${params.query || "all"}`);
    console.log(`   Since: ${params.since || "any"}`);
    console.log(`   Limit: ${params.limit || 20}`);
    
    // Mock response for development
    return [
      {
        id: "mock-1",
        subject: "[MOCK] AI Startup Newsletter - Week 7",
        from: "newsletter@berkeley.edu",
        date: new Date().toISOString(),
        body: "This week in AI startups: Anthropic raises Series C...",
        links: ["https://example.com/article1"]
      }
    ];
  }
};
