/**
 * 🤖 Research Agent - Strands + AgentCore Runtime
 * 
 * A configurable research agent that can search the web,
 * scrape content, and save documents to the user's knowledge base.
 * 
 * Exposes /ping and /invocations endpoints for AgentCore Runtime.
 */

import express, { type Request, type Response } from 'express'
import { Agent, BedrockModel } from '@strands-agents/sdk'
import { webSearchTool } from './tools/web-search.js'
import { scrapeTool } from './tools/scrape.js'
import { saveDocTool } from './tools/save-doc.js'

const PORT = process.env.PORT || 8080
const REGION = process.env.AWS_REGION || 'eu-west-1'

// System prompt for the research agent
const SYSTEM_PROMPT = `You are a research agent. Your job is to research topics and save useful findings.

WORKFLOW:
1. Use web_search to find relevant information
2. Optionally use scrape to get more details from promising URLs
3. Use save_doc to save each finding as a document

For each document you save:
- title: Clear, descriptive title
- tags: 2-5 relevant tags
- description: 1-2 sentence summary
- content: Full details in markdown (include key facts, quotes, links)

Be thorough but concise. Save 2-5 documents per research session.
Focus on quality over quantity - only save genuinely useful findings.`

// Create the Strands agent with Bedrock
const agent = new Agent({
  systemPrompt: SYSTEM_PROMPT,
  model: new BedrockModel({
    region: REGION,
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  }),
  tools: [webSearchTool, scrapeTool, saveDocTool],
  printer: false, // Disable console output in production
})

const app = express()

// Health check endpoint (REQUIRED for AgentCore)
app.get('/ping', (_req: Request, res: Response) => {
  res.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  })
})

// Agent invocation endpoint (REQUIRED for AgentCore)
// AWS sends binary payload, so we use express.raw middleware
app.post('/invocations', express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
  try {
    // Decode binary payload from AWS SDK
    const payload = new TextDecoder().decode(req.body as Buffer)
    let prompt: string
    let userId: string
    let agentId: string
    let runId: string

    // Try to parse as JSON (structured invocation)
    try {
      const parsed = JSON.parse(payload)
      prompt = parsed.prompt || parsed.message || payload
      userId = parsed.userId || process.env.USER_ID || ''
      agentId = parsed.agentId || process.env.AGENT_ID || ''
      runId = parsed.runId || `run-${Date.now()}`
    } catch {
      // Plain text prompt
      prompt = payload
      userId = process.env.USER_ID || ''
      agentId = process.env.AGENT_ID || ''
      runId = `run-${Date.now()}`
    }

    // Set environment for tools
    process.env.USER_ID = userId
    process.env.AGENT_ID = agentId
    process.env.RUN_ID = runId

    console.log(`🔍 Research invocation for user: ${userId}`)
    console.log(`📝 Prompt: ${prompt.slice(0, 100)}...`)

    // Invoke the agent
    const result = await agent.invoke(prompt)

    console.log(`✅ Research complete`)

    return res.json({
      success: true,
      runId,
      response: result.lastMessage,
      // metrics: result.metrics, // Coming soon in Strands
    })
  } catch (error) {
    console.error('❌ Research error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Streaming invocation (for AG-UI)
app.post('/invocations/stream', express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const payload = new TextDecoder().decode(req.body as Buffer)
    let prompt: string
    let userId: string
    let agentId: string
    let runId: string

    try {
      const parsed = JSON.parse(payload)
      prompt = parsed.prompt || parsed.message || payload
      userId = parsed.userId || process.env.USER_ID || ''
      agentId = parsed.agentId || process.env.AGENT_ID || ''
      runId = parsed.runId || `run-${Date.now()}`
    } catch {
      prompt = payload
      userId = process.env.USER_ID || ''
      agentId = process.env.AGENT_ID || ''
      runId = `run-${Date.now()}`
    }

    process.env.USER_ID = userId
    process.env.AGENT_ID = agentId
    process.env.RUN_ID = runId

    // Send AG-UI start event
    res.write(`data: ${JSON.stringify({ type: 'RUN_STARTED', runId })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: `msg-${Date.now()}` })}\n\n`)

    // Stream agent events
    for await (const event of agent.stream(prompt)) {
      // Map Strands events to AG-UI events
      if (event.type === 'modelContentBlockDeltaEvent' && 'delta' in event) {
        const delta = event.delta as { type: string; text?: string }
        if (delta.type === 'textDelta' && delta.text) {
          res.write(`data: ${JSON.stringify({ 
            type: 'TEXT_MESSAGE_CONTENT', 
            delta: delta.text 
          })}\n\n`)
        }
      }
      
      if (event.type === 'modelContentBlockStartEvent' && 'start' in event) {
        const start = event.start as { type: string; name?: string; toolUseId?: string }
        if (start.type === 'toolUseStart') {
          res.write(`data: ${JSON.stringify({ 
            type: 'TOOL_CALL_START', 
            toolCallId: start.toolUseId,
            toolCallName: start.name 
          })}\n\n`)
        }
      }
      
      if (event.type === 'afterToolsEvent') {
        res.write(`data: ${JSON.stringify({ type: 'TOOL_CALL_END' })}\n\n`)
      }
    }

    // Send AG-UI end events
    res.write(`data: ${JSON.stringify({ type: 'TEXT_MESSAGE_END' })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'RUN_FINISHED', runId })}\n\n`)
    res.end()

  } catch (error) {
    console.error('❌ Stream error:', error)
    res.write(`data: ${JSON.stringify({ 
      type: 'RUN_ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })}\n\n`)
    res.end()
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Research Agent listening on port ${PORT}`)
  console.log(`📍 Endpoints:`)
  console.log(`   GET  /ping`)
  console.log(`   POST /invocations`)
  console.log(`   POST /invocations/stream`)
})
