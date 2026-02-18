/**
 * Web Scraper Tool
 * Fetch and extract content from web pages
 */

export interface WebScrapeParams {
  url: string;
  format?: "text" | "html" | "json";
  selector?: string;
}

export interface WebScrapeResult {
  url: string;
  title: string;
  content: string;
  fetchedAt: string;
}

export const webScrapeTool = {
  description: "Fetch and extract content from web pages",

  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to scrape",
      },
      format: {
        type: "string",
        enum: ["text", "html", "json"],
        description: "Output format (default: text)",
      },
      selector: {
        type: "string",
        description: "CSS selector to extract specific content",
      },
    },
    required: ["url"],
  },

  async execute(params: WebScrapeParams): Promise<WebScrapeResult> {
    console.log(`🌐 Scraping: ${params.url}`);

    try {
      const response = await fetch(params.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StartupResearcher/1.0)",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Simple text extraction (strip HTML tags)
      let content = html;
      if (params.format !== "html") {
        // Remove scripts and styles
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        // Remove HTML tags
        content = content.replace(/<[^>]+>/g, " ");
        // Clean up whitespace
        content = content.replace(/\s+/g, " ").trim();
        // Limit length
        content = content.slice(0, 10000);
      }

      return {
        url: params.url,
        title,
        content,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Scrape failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};
