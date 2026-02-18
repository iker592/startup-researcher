# Startup Researcher - Task List

## 🚀 Phase 0: Project Setup
- [x] Create GitHub repository
- [x] Write PRD
- [x] Create task list
- [ ] Initialize monorepo structure (packages/)
- [ ] Set up PostgreSQL database
- [ ] Create basic README
- [ ] Set up CI/CD (GitHub Actions)

## 🔧 Phase 1: AgentCore Gateway
Build the gateway that exposes external tools to agents.

### Gateway Core
- [ ] Initialize gateway package (`packages/gateway`)
- [ ] Set up Express/Fastify server
- [ ] Implement tool registry pattern
- [ ] Add authentication/API keys management
- [ ] Add rate limiting middleware
- [ ] Add request logging

### Tools Implementation
- [ ] **Email Tool** (`email_fetch`)
  - [ ] IMAP connection handler
  - [ ] Berkeley inbox integration
  - [ ] Email parsing (subject, body, links)
  - [ ] Search/filter functionality
  
- [ ] **Web Scraper** (`web_scrape`)
  - [ ] Puppeteer/Playwright setup
  - [ ] Dynamic content handling
  - [ ] CSS selector extraction
  - [ ] Rate limiting per domain
  
- [ ] **API Client** (`api_call`)
  - [ ] Crunchbase API integration
  - [ ] Generic REST client
  - [ ] Response normalization
  
- [ ] **Paper Fetcher** (`paper_fetch`)
  - [ ] arXiv API integration
  - [ ] Semantic Scholar API
  - [ ] PDF text extraction
  
- [ ] **Database Tool** (`db_query`)
  - [ ] PostgreSQL connection pool
  - [ ] CRUD operations
  - [ ] Query builder

## 💾 Phase 2: Database Layer
- [ ] Initialize DB package (`packages/db`)
- [ ] Set up Drizzle ORM
- [ ] Create migration system
- [ ] Implement schemas:
  - [ ] `startups` table
  - [ ] `funding_rounds` table
  - [ ] `team_members` table
  - [ ] `sources` table
  - [ ] `analysis` table
- [ ] Seed data script
- [ ] Airtable sync utility (optional)

## 🤖 Phase 3: Agent Team
Spawn specialized agents for different tasks.

### Collector Agent
- [ ] Define agent persona/instructions
- [ ] Email collection workflow
- [ ] Web scraping workflow
- [ ] Deduplication logic
- [ ] Source attribution

### Enricher Agent
- [ ] Funding data enrichment
- [ ] Team member extraction
- [ ] Industry categorization
- [ ] Use case extraction
- [ ] Competitor mapping

### Analyst Agent
- [ ] Pattern recognition prompts
- [ ] Success factor analysis
- [ ] Failure/pivot analysis
- [ ] Whitespace identification
- [ ] Trend detection

### Reporter Agent
- [ ] Weekly digest generation
- [ ] Insight summarization
- [ ] Opportunity scoring
- [ ] Visualization suggestions

## 🧪 Phase 4: Testing
- [ ] Unit tests for gateway tools
- [ ] Integration tests for DB
- [ ] E2E tests for agent workflows
- [ ] Mock data fixtures
- [ ] Local dev environment

## 📊 Phase 5: Dashboard (Stretch)
- [ ] React frontend
- [ ] Startup browser
- [ ] Pattern visualizations
- [ ] Funding timeline charts
- [ ] Industry heatmaps

## 📝 Phase 6: Documentation
- [ ] README with setup instructions
- [ ] API documentation
- [ ] Agent prompt documentation
- [ ] Contributing guide
- [ ] Architecture diagrams

---

## 🔥 Quick Start Priorities

### Day 1 (Today)
1. [x] PRD + Task list
2. [ ] Monorepo structure
3. [ ] Database schema + migrations
4. [ ] Gateway skeleton with 1 tool

### Week 1
1. [ ] Email fetcher working
2. [ ] Web scraper working
3. [ ] 10 startups manually collected
4. [ ] Collector agent operational

### Week 2
1. [ ] API integrations
2. [ ] 50+ startups in DB
3. [ ] Enricher agent operational
4. [ ] Basic patterns emerging

---

## 🎯 Agent Assignment

| Task | Assigned To | Status |
|------|-------------|--------|
| Gateway core | agent:gateway-builder | TODO |
| DB setup | agent:db-builder | TODO |
| Email tool | agent:email-tool | TODO |
| Web scraper | agent:scraper-tool | TODO |
| Collector agent | agent:collector | TODO |
| Enricher agent | agent:enricher | TODO |

---
*Last updated: 2026-02-18*
