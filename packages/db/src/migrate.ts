/**
 * Database migration script
 * Creates all tables from scratch
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/startup_researcher";

const MIGRATION_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Startups table
CREATE TABLE IF NOT EXISTS startups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  founded_date DATE,
  industries TEXT[],
  use_case TEXT,
  target_market TEXT,
  status TEXT DEFAULT 'active',
  headquarters TEXT,
  employee_count TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Funding rounds table
CREATE TABLE IF NOT EXISTS funding_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  round_type TEXT,
  amount_usd BIGINT,
  date DATE,
  investors TEXT[],
  lead_investor TEXT,
  valuation BIGINT,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  background TEXT[],
  education TEXT[],
  is_founder BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sources table (raw data)
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID REFERENCES startups(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  title TEXT,
  content TEXT,
  author TEXT,
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Analysis results table
CREATE TABLE IF NOT EXISTS analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,
  findings JSONB,
  confidence REAL,
  agent_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Patterns table (aggregated insights)
CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  evidence JSONB,
  confidence REAL,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_startups_name ON startups(name);
CREATE INDEX IF NOT EXISTS idx_startups_status ON startups(status);
CREATE INDEX IF NOT EXISTS idx_startups_industries ON startups USING GIN(industries);
CREATE INDEX IF NOT EXISTS idx_funding_startup ON funding_rounds(startup_id);
CREATE INDEX IF NOT EXISTS idx_funding_date ON funding_rounds(date);
CREATE INDEX IF NOT EXISTS idx_sources_startup ON sources(startup_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);
CREATE INDEX IF NOT EXISTS idx_analysis_startup ON analysis(startup_id);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
`;

async function migrate() {
  console.log("🔧 Running migrations...");
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    await pool.query(MIGRATION_SQL);
    console.log("✅ Migrations completed successfully!");
    
    // Show table counts
    const tables = ["startups", "funding_rounds", "team_members", "sources", "analysis", "patterns"];
    console.log("\n📈 Table stats:");
    
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} rows`);
    }
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
