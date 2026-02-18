import { pgTable, uuid, text, timestamp, date, bigint, boolean, jsonb, real } from "drizzle-orm/pg-core";

/**
 * Core startup data
 */
export const startups = pgTable("startups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  description: text("description"),
  foundedDate: date("founded_date"),
  industries: text("industries").array(),
  useCase: text("use_case"),
  targetMarket: text("target_market"),
  status: text("status").default("active"), // active, acquired, failed, pivoted
  headquarters: text("headquarters"),
  employeeCount: text("employee_count"),
  linkedinUrl: text("linkedin_url"),
  twitterHandle: text("twitter_handle"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Funding rounds
 */
export const fundingRounds = pgTable("funding_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").references(() => startups.id),
  roundType: text("round_type"), // pre_seed, seed, series_a, series_b, etc
  amountUsd: bigint("amount_usd", { mode: "number" }),
  date: date("date"),
  investors: text("investors").array(),
  leadInvestor: text("lead_investor"),
  valuation: bigint("valuation", { mode: "number" }),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Team members (founders, key hires)
 */
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").references(() => startups.id),
  name: text("name").notNull(),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  twitterHandle: text("twitter_handle"),
  background: text("background").array(), // previous companies
  education: text("education").array(),
  isFounder: boolean("is_founder").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Raw sources (emails, articles, etc)
 */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").references(() => startups.id),
  sourceType: text("source_type").notNull(), // email, article, tweet, paper, crunchbase
  url: text("url"),
  title: text("title"),
  content: text("content"),
  author: text("author"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  metadata: jsonb("metadata"),
});

/**
 * Analysis results
 */
export const analysis = pgTable("analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").references(() => startups.id),
  analysisType: text("analysis_type").notNull(), // pattern, comparison, whitespace, sentiment
  findings: jsonb("findings"),
  confidence: real("confidence"),
  agentId: text("agent_id"), // which agent performed the analysis
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Patterns (aggregated insights)
 */
export const patterns = pgTable("patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(), // success_factor, failure_mode, trend, whitespace
  name: text("name").notNull(),
  description: text("description"),
  evidence: jsonb("evidence"), // startup IDs and supporting data
  confidence: real("confidence"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports
export type Startup = typeof startups.$inferSelect;
export type NewStartup = typeof startups.$inferInsert;
export type FundingRound = typeof fundingRounds.$inferSelect;
export type NewFundingRound = typeof fundingRounds.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Analysis = typeof analysis.$inferSelect;
export type NewAnalysis = typeof analysis.$inferInsert;
export type Pattern = typeof patterns.$inferSelect;
export type NewPattern = typeof patterns.$inferInsert;
