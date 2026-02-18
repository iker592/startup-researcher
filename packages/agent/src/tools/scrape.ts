/**
 * Web Scrape Tool - Extract content from URLs
 */

import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

export const scrapeTool = tool({
  name: 'scrape',
  description: 'Fetch and extract text content from a URL. Returns the page title and main content.',
  inputSchema: z.object({
    url: z.string().url().describe('URL to scrape'),
    maxLength: z.number().optional().default(8000).describe('Max characters to return (default 8000)'),
  }),
  callback: async (input) => {
    const { url, maxLength = 8000 } = input
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchAgent/1.0)' },
      })
      
      if (!response.ok) {
        return JSON.stringify({ 
          success: false, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        })
      }
      
      const html = await response.text()

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : ''

      // Extract meta description
      const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      const description = metaMatch ? metaMatch[1].trim() : ''

      // Clean HTML to text
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)

      return JSON.stringify({ 
        success: true, 
        url, 
        title, 
        description,
        contentLength: content.length,
        content 
      })
    } catch (error) {
      return JSON.stringify({ 
        success: false, 
        error: `Scrape failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      })
    }
  },
})
