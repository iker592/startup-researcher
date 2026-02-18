# Startup Researcher - Product Requirements Document

## Vision
Build an AI-powered pattern recognition system to analyze successful AI agent startups, identifying what worked, what didn't, and finding whitespace opportunities for our own AI agent venture.

## Problem Statement
The AI agent space is rapidly evolving with hundreds of startups launching. Without systematic analysis, it's hard to:
- Identify successful patterns across industries
- Learn from failures and pivots
- Find underserved niches
- Make data-driven decisions about which agent to build

## Solution Overview
An automated research pipeline that:
1. **Collects** startup data from multiple sources
2. **Enriches** with funding, team, and traction data
3. **Analyzes** patterns using AI
4. **Visualizes** insights in a structured database (Airtable/DB)

## Data Sources

### Primary Sources
| Source | Data Type | Priority |
|--------|-----------|----------|
| Berkeley Inbox | Startup newsletters, updates | P0 |
| Crunchbase/PitchBook | Funding, valuations, investors | P0 |
| TechCrunch/VentureBeat | News, launches, pivots | P1 |
| Twitter/X | Founder insights, product updates | P1 |
| LinkedIn | Team composition, hiring signals | P2 |
| arXiv/Papers | Technical approaches, research | P2 |
| Product Hunt | Launch reception, user feedback | P2 |
| GitHub | Open source activity, repos | P2 |

### Filtering Criteria
- **Must have**: Raised funding (Seed+ or significant angel)
- **Focus**: AI Agents / Autonomous AI / LLM Applications
- **Recency**: Founded 2022-2025
- **Geography**: Global (US focus initially)

## Core Features

### Phase 1: Data Collection (MVP)
- [ ] Email parser for Berkeley inbox (newsletters)
- [ ] Web scraper for startup databases
- [ ] API integrations (Crunchbase, etc.)
- [ ] Storage in PostgreSQL/Airtable

### Phase 2: Enrichment
- [ ] Auto-categorize by industry vertical
- [ ] Extract use cases and value propositions
- [ ] Track funding rounds and investors
- [ ] Identify key team members/backgrounds

### Phase 3: Analysis
- [ ] Pattern recognition across successful startups
- [ ] Failure/pivot analysis
- [ ] Industry heatmaps
- [ ] Whitespace identification

### Phase 4: Insights
- [ ] Dashboard with visualizations
- [ ] Weekly digest reports
- [ ] Opportunity scoring
- [ ] Competitive landscape maps

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentCore Gateway                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Email Tool  │  │ Web Scraper │  │  API Tools  │          │
│  │  (IMAP)     │  │ (Puppeteer) │  │ (REST/GQL)  │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│                ┌─────────────────┐                          │
│                │  Data Pipeline  │                          │
│                │   (Transform)   │                          │
│                └────────┬────────┘                          │
│                         ▼                                    │
│         ┌───────────────────────────────┐                   │
│         │        PostgreSQL DB          │                   │
│         │  - startups    - funding      │                   │
│         │  - sources     - analysis     │                   │
│         └───────────────┬───────────────┘                   │
│                         ▼                                    │
│                ┌─────────────────┐                          │
│                │  Airtable Sync  │                          │
│                │   (Optional)    │                          │
│                └─────────────────┘                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Agent Team                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Collector│  │ Enricher │  │ Analyst  │  │ Reporter │    │
│  │  Agent   │  │  Agent   │  │  Agent   │  │  Agent   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## AgentCore Gateway Tools

Tools to expose external world access to agents:

### 1. Email Fetcher (`email_fetch`)
```typescript
{
  source: "berkeley" | "personal",
  query: string,      // search query
  since: string,      // date filter
  limit: number
}
```

### 2. Web Scraper (`web_scrape`)
```typescript
{
  url: string,
  selector?: string,  // CSS selector
  waitFor?: string,   // dynamic content
  format: "text" | "html" | "json"
}
```

### 3. API Client (`api_call`)
```typescript
{
  service: "crunchbase" | "pitchbook" | "linkedin",
  endpoint: string,
  params: object
}
```

### 4. Paper Fetcher (`paper_fetch`)
```typescript
{
  query: string,
  source: "arxiv" | "semantic_scholar",
  limit: number
}
```

### 5. Database Operations (`db_query`)
```typescript
{
  operation: "insert" | "update" | "query",
  table: string,
  data?: object,
  where?: object
}
```

## Database Schema

```sql
-- Core startup data
CREATE TABLE startups (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  founded_date DATE,
  industry TEXT[],
  use_case TEXT,
  target_market TEXT,
  status TEXT, -- active, acquired, failed, pivoted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Funding rounds
CREATE TABLE funding_rounds (
  id UUID PRIMARY KEY,
  startup_id UUID REFERENCES startups(id),
  round_type TEXT, -- seed, series_a, etc
  amount_usd BIGINT,
  date DATE,
  investors TEXT[],
  lead_investor TEXT,
  source_url TEXT
);

-- Team members
CREATE TABLE team_members (
  id UUID PRIMARY KEY,
  startup_id UUID REFERENCES startups(id),
  name TEXT,
  role TEXT,
  linkedin_url TEXT,
  background TEXT[], -- previous companies
  is_founder BOOLEAN
);

-- Raw sources
CREATE TABLE sources (
  id UUID PRIMARY KEY,
  startup_id UUID REFERENCES startups(id),
  source_type TEXT, -- email, article, tweet, paper
  url TEXT,
  title TEXT,
  content TEXT,
  fetched_at TIMESTAMP,
  metadata JSONB
);

-- Analysis results
CREATE TABLE analysis (
  id UUID PRIMARY KEY,
  startup_id UUID REFERENCES startups(id),
  analysis_type TEXT, -- pattern, comparison, whitespace
  findings JSONB,
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Success Metrics
- [ ] 100+ AI agent startups catalogued
- [ ] 5+ clear pattern categories identified
- [ ] 3+ whitespace opportunities discovered
- [ ] Weekly automated reports generated

## Timeline
| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Setup | Day 1 | Repo, DB, Gateway skeleton |
| MVP | Week 1 | Email parser + basic scraping |
| Enrichment | Week 2 | API integrations + categorization |
| Analysis | Week 3 | Pattern recognition + insights |
| Polish | Week 4 | Dashboard + automation |

## Open Questions
1. Which Airtable base structure to use?
2. API keys needed (Crunchbase, etc.)?
3. Berkeley email access method (IMAP vs forwarding)?
4. Rate limiting strategy for scraping?

---
*Created: 2026-02-18*
*Authors: Iker, Pandulu 🐼*
