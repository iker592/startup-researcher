/**
 * Collector Agent
 * Gathers startup data from various sources
 */

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3002";

// Agent system prompt
export const COLLECTOR_PROMPT = `You are a Startup Research Collector agent.

Your job is to find and collect information about AI agent startups from various sources:
- Email newsletters (especially from Berkeley)
- News articles (TechCrunch, VentureBeat)
- Startup databases (Crunchbase)
- Twitter/X announcements
- Academic papers

## Tools Available

1. **email_fetch** - Fetch emails from configured inboxes
   - source: "berkeley" | "personal"
   - query: search keywords
   - since: date filter
   - limit: max results

2. **web_scrape** - Scrape web pages
   - url: page URL
   - selector: CSS selector (optional)

3. **api_call** - Call external APIs
   - service: "crunchbase" | "pitchbook"
   - endpoint: API path
   - params: query parameters

4. **db_query** - Store findings in database
   - operation: "insert" | "query"
   - table: "startups" | "sources"
   - data: object to insert

## Collection Criteria

Focus on startups that:
- Build AI agents / autonomous AI / LLM applications
- Have raised funding (Seed or higher)
- Founded 2022-2025
- Have clear product/use case

## Output Format

For each startup found, extract:
- Name
- Website
- Description (1-2 sentences)
- Industry/vertical
- Use case
- Founding date (if known)
- Funding status

Then insert into the database using db_query.

## Workflow

1. Check email for recent startup newsletters
2. Search Crunchbase for new AI agent startups
3. Scrape relevant news articles
4. Deduplicate against existing database
5. Insert new findings
6. Report summary
`;

// Tool call helper
async function callTool(toolName: string, params: any) {
  const response = await fetch(`${GATEWAY_URL}/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json();
}

// Main collection workflow
async function collect() {
  console.log("🤖 Collector Agent starting...\n");
  
  // Step 1: Fetch recent emails
  console.log("📧 Step 1: Checking emails...");
  const emails = await callTool("email_fetch", {
    source: "berkeley",
    query: "AI startup funding",
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    limit: 10,
  });
  console.log(`   Found ${emails.result?.length || 0} emails\n`);
  
  // Step 2: Search for AI agent startups
  console.log("🔍 Step 2: Searching for startups...");
  const searchUrls = [
    "https://techcrunch.com/tag/artificial-intelligence/",
    "https://venturebeat.com/category/ai/",
  ];
  
  for (const url of searchUrls) {
    console.log(`   Scraping: ${url}`);
    const page = await callTool("web_scrape", { url, format: "text" });
    console.log(`   Got ${page.result?.content?.length || 0} chars\n`);
  }
  
  // Step 3: Check existing startups in DB
  console.log("💾 Step 3: Checking database...");
  const existing = await callTool("db_query", {
    operation: "query",
    table: "startups",
    limit: 100,
  });
  console.log(`   ${existing.result?.rowCount || 0} startups in DB\n`);
  
  // Step 4: Report
  console.log("✅ Collection complete!");
  console.log("   - Emails processed: " + (emails.result?.length || 0));
  console.log("   - Pages scraped: " + searchUrls.length);
  console.log("   - Startups in DB: " + (existing.result?.rowCount || 0));
}

// Run if called directly
if (import.meta.main) {
  collect().catch(console.error);
}

export { collect, callTool };
