/**
 * Web Scraper Tool
 * Fetches and extracts content from web pages
 */

import * as cheerio from "cheerio";

export interface WebScrapeParams {
  url: string;
  selector?: string;
  waitFor?: string;
  format?: "text" | "html" | "json";
  headers?: Record<string, string>;
}

export interface WebScrapeResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  meta?: Record<string, string>;
}

// Rate limiting per domain
const domainLastRequest: Record<string, number> = {};
const MIN_DELAY_MS = 2000;

async function respectRateLimit(url: string) {
  const domain = new URL(url).hostname;
  const lastRequest = domainLastRequest[domain] || 0;
  const elapsed = Date.now() - lastRequest;
  
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  
  domainLastRequest[domain] = Date.now();
}

export const webScrapeTool = {
  description: "Scrape web pages and extract content, links, and metadata",
  
  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to scrape"
      },
      selector: {
        type: "string", 
        description: "CSS selector to extract specific content"
      },
      waitFor: {
        type: "string",
        description: "CSS selector to wait for (dynamic content)"
      },
      format: {
        type: "string",
        enum: ["text", "html", "json"],
        default: "text"
      },
      headers: {
        type: "object",
        description: "Custom HTTP headers"
      }
    },
    required: ["url"]
  },
  
  async execute(params: WebScrapeParams): Promise<WebScrapeResult> {
    await respectRateLimit(params.url);
    
    console.log(`🌐 Scraping: ${params.url}`);
    
    try {
      // Simple fetch for static content
      const response = await fetch(params.url, {
        headers: {
          "User-Agent": "StartupResearcher/1.0 (Research Bot)",
          ...params.headers,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract title
      const title = $("title").text().trim() || 
                    $('meta[property="og:title"]').attr("content") || 
                    "";
      
      // Extract content
      let content: string;
      if (params.selector) {
        content = $(params.selector).text().trim();
      } else {
        // Remove scripts, styles, nav, footer
        $("script, style, nav, footer, header, aside").remove();
        content = $("article, main, .content, body").first().text().trim();
      }
      
      // Clean up whitespace
      content = content.replace(/\s+/g, " ").substring(0, 10000);
      
      // Extract links
      const links: string[] = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("http")) {
          links.push(href);
        }
      });
      
      // Extract meta
      const meta: Record<string, string> = {};
      $("meta[property], meta[name]").each((_, el) => {
        const key = $(el).attr("property") || $(el).attr("name");
        const value = $(el).attr("content");
        if (key && value) meta[key] = value;
      });
      
      return {
        url: params.url,
        title,
        content,
        links: [...new Set(links)].slice(0, 50),
        meta,
      };
      
    } catch (error) {
      throw new Error(`Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
};
