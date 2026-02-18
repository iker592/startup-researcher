/**
 * Save Doc Tool - Save research results to DynamoDB
 * Generic document model: title, tags, description, content
 */

import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

// Get config from environment
const TABLE_NAME = process.env.TABLE_NAME || ''
const USER_ID = process.env.USER_ID || ''

const dbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export const saveDocTool = tool({
  name: 'save_doc',
  description: 'Save a research document to the database. Use this to persist findings, summaries, or any research results.',
  inputSchema: z.object({
    title: z.string().describe('Document title'),
    tags: z.array(z.string()).describe('Tags/categories (e.g., ["ai", "startup", "funding"])'),
    description: z.string().describe('Short summary (1-2 sentences)'),
    content: z.string().describe('Full content in markdown format'),
    sourceUrl: z.string().optional().describe('Source URL if applicable'),
  }),
  callback: async (input) => {
    const { title, tags, description, content, sourceUrl } = input
    
    if (!TABLE_NAME) {
      return JSON.stringify({ success: false, error: 'TABLE_NAME not configured' })
    }
    if (!USER_ID) {
      return JSON.stringify({ success: false, error: 'USER_ID not configured' })
    }
    
    try {
      const id = slugify(title) + '-' + Date.now().toString(36)
      const now = new Date().toISOString()
      const agentId = process.env.AGENT_ID || 'unknown'
      const runId = process.env.RUN_ID || 'unknown'

      const item = {
        // Keys (user-scoped)
        pk: `USER#${USER_ID}#DOC#${id}`,
        sk: 'CONTENT',
        // GSI for listing user's docs
        gsi1pk: `USER#${USER_ID}#DOC`,
        gsi1sk: now,
        // Data
        id,
        userId: USER_ID,
        entityType: 'doc',
        title,
        tags,
        description,
        content,
        sourceUrl: sourceUrl || null,
        sourceAgentId: agentId,
        sourceRunId: runId,
        createdAt: now,
        updatedAt: now,
      }

      await dbClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }))

      return JSON.stringify({ 
        success: true, 
        id, 
        title,
        message: `Document "${title}" saved successfully` 
      })
    } catch (error) {
      return JSON.stringify({ 
        success: false, 
        error: `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      })
    }
  },
})
