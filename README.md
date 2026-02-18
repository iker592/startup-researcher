# 🔬 Startup Researcher

AI-powered pattern recognition for successful AI agent startups.

> Learn from the best. Find the whitespace. Build what matters.

## 🎯 What is this?

An automated research pipeline that:
- **Collects** AI startup data from emails, web, and APIs
- **Enriches** with funding, team, and traction data  
- **Analyzes** patterns using AI agents
- **Surfaces** insights for your own venture

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           AgentCore Gateway                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Email  │ │   Web   │ │   API   │       │
│  │  Tool   │ │ Scraper │ │  Client │       │
│  └────┬────┘ └────┬────┘ └────┬────┘       │
│       └───────────┼───────────┘             │
│                   ▼                         │
│           ┌─────────────┐                   │
│           │ PostgreSQL  │                   │
│           └─────────────┘                   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│              Agent Team                      │
│  🤖 Collector → Enricher → Analyst → Report │
└─────────────────────────────────────────────┘
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| `packages/gateway` | AgentCore Gateway with external tools |
| `packages/db` | Database schema and migrations |
| `packages/agents` | Agent definitions and workflows |
| `packages/web` | Dashboard (stretch goal) |

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Set up database
bun run db:migrate

# Start gateway
bun run gateway:dev

# Run collector agent
bun run agent:collector
```

## 📊 Data Sources

- 📧 Berkeley inbox (startup newsletters)
- 🌐 Crunchbase / PitchBook (funding data)
- 📰 TechCrunch / VentureBeat (news)
- 🐦 Twitter/X (founder insights)
- 📄 arXiv (research papers)

## 📖 Documentation

- [PRD](./docs/PRD.md) - Product requirements
- [TODO](./TODO.md) - Task list
- [Architecture](./docs/ARCHITECTURE.md) - Technical details

## 🤝 Team

Built by Iker & Pandulu 🐼

---

*Part of the AI agent venture research*
