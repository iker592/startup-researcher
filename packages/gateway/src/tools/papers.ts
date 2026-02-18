/**
 * Paper Fetcher Tool
 * Fetches academic papers from arXiv and Semantic Scholar
 */

export interface PaperFetchParams {
  query: string;
  source?: "arxiv" | "semantic_scholar" | "both";
  limit?: number;
  category?: string; // e.g., "cs.AI", "cs.CL"
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semantic_scholar";
  citations?: number;
}

export interface PaperFetchResult {
  papers: Paper[];
  total: number;
}

async function searchArxiv(query: string, limit: number, category?: string): Promise<Paper[]> {
  // Build arXiv API query
  let searchQuery = `all:${encodeURIComponent(query)}`;
  if (category) {
    searchQuery = `cat:${category}+AND+${searchQuery}`;
  }
  
  const url = `http://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  
  console.log(`📄 arXiv search: ${query}`);
  
  try {
    const response = await fetch(url);
    const xml = await response.text();
    
    // Simple XML parsing for arXiv Atom feed
    const papers: Paper[] = [];
    const entries = xml.split("<entry>").slice(1);
    
    for (const entry of entries) {
      const getTag = (tag: string) => {
        const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].trim() : "";
      };
      
      const id = getTag("id").split("/abs/").pop() || "";
      const title = getTag("title").replace(/\s+/g, " ");
      const abstract = getTag("summary").replace(/\s+/g, " ");
      const published = getTag("published");
      
      // Extract authors
      const authors: string[] = [];
      const authorMatches = entry.matchAll(/<author>[\s\S]*?<name>([^<]+)<\/name>/g);
      for (const match of authorMatches) {
        authors.push(match[1].trim());
      }
      
      papers.push({
        id: `arxiv:${id}`,
        title,
        authors,
        abstract,
        published,
        url: `https://arxiv.org/abs/${id}`,
        pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
        source: "arxiv",
      });
    }
    
    return papers;
  } catch (error) {
    console.error("arXiv search failed:", error);
    return [];
  }
}

async function searchSemanticScholar(query: string, limit: number): Promise<Paper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId,title,authors,abstract,year,citationCount,url`;
  
  console.log(`📄 Semantic Scholar search: ${query}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY || "",
      },
    });
    
    const data = await response.json() as any;
    
    return (data.data || []).map((paper: any) => ({
      id: `s2:${paper.paperId}`,
      title: paper.title,
      authors: paper.authors?.map((a: any) => a.name) || [],
      abstract: paper.abstract || "",
      published: paper.year?.toString() || "",
      url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
      source: "semantic_scholar" as const,
      citations: paper.citationCount,
    }));
  } catch (error) {
    console.error("Semantic Scholar search failed:", error);
    return [];
  }
}

export const paperTool = {
  description: "Search academic papers on arXiv and Semantic Scholar",
  
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query for papers"
      },
      source: {
        type: "string",
        enum: ["arxiv", "semantic_scholar", "both"],
        default: "both",
        description: "Which source to search"
      },
      limit: {
        type: "number",
        default: 10,
        description: "Max papers to return per source"
      },
      category: {
        type: "string",
        description: "arXiv category (e.g., cs.AI, cs.CL)"
      }
    },
    required: ["query"]
  },
  
  async execute(params: PaperFetchParams): Promise<PaperFetchResult> {
    const limit = params.limit || 10;
    const source = params.source || "both";
    
    let papers: Paper[] = [];
    
    if (source === "arxiv" || source === "both") {
      const arxivPapers = await searchArxiv(params.query, limit, params.category);
      papers = papers.concat(arxivPapers);
    }
    
    if (source === "semantic_scholar" || source === "both") {
      const s2Papers = await searchSemanticScholar(params.query, limit);
      papers = papers.concat(s2Papers);
    }
    
    // Sort by date (newest first)
    papers.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
    
    return {
      papers,
      total: papers.length,
    };
  }
};
