/**
 * Web Search Tool - Search the web using DuckDuckGo
 */

import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

export const webSearchTool = tool({
  name: 'web_search',
  description: 'Search the web for information. Returns titles, URLs, and snippets from search results.',
  inputSchema: z.object({
    query: z.string().describe('Search query (e.g., "AI coding assistant startups 2024")'),
    limit: z.number().optional().default(5).describe('Max results to return (default 5)'),
  }),
  callback: async (input) => {
    const { query, limit = 5 } = input
    
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchAgent/1.0)' },
      })
      const html = await response.text()

      // Extract results using regex
      const results: { title: string; url: string; snippet: string }[] = []
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)/g

      const urls: string[] = []
      const titles: string[] = []
      let match

      while ((match = linkRegex.exec(html)) !== null && urls.length < limit) {
        urls.push(match[1])
        titles.push(match[2].trim())
      }

      const snippets: string[] = []
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < limit) {
        snippets.push(match[1].replace(/<[^>]+>/g, '').trim())
      }

      for (let i = 0; i < urls.length; i++) {
        results.push({
          title: titles[i] || '',
          url: urls[i],
          snippet: snippets[i] || '',
        })
      }

      return JSON.stringify({ 
        success: true, 
        count: results.length, 
        results 
      })
    } catch (error) {
      return JSON.stringify({ 
        success: false, 
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      })
    }
  },
})
