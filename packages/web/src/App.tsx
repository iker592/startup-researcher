import { useState, useEffect } from "react";
import { Chat } from "./Chat";
import { useAuth } from "./useAuth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";
const RESEARCH_URL = import.meta.env.VITE_RESEARCH_URL || `${API_URL}/research`;
const AGENT_RUNNER_URL = import.meta.env.VITE_AGENT_RUNNER_URL || `${API_URL}/agent-run`;

interface Startup {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industries?: string[];
  status?: string;
  source?: string;
  createdAt?: string;
}

interface Doc {
  id: string;
  title: string;
  description: string;
  tags: string[];
  content?: string;
  sourceUrl?: string;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  prompt: string;
  schedule?: string;
  cronExpression?: string;
  enabled?: boolean;
  lastRun?: string;
  createdAt: string;
  docs?: Doc[];
  skillIds?: string[];
}

interface AgentRun {
  runId: string;
  agentId: string;
  agentName: string;
  prompt: string;
  result: string;
  status: string;
  createdAt: string;
}

interface ResearchResult {
  success: boolean;
  startupsFound: string[];
  count: number;
  summary: string;
}

type Tab = "chat" | "research" | "startups" | "agents" | "docs" | "skills";

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: "chat", icon: "🔍", label: "Chat" },
  { id: "research", icon: "🚀", label: "Research" },
  { id: "startups", icon: "📊", label: "Startups" },
  { id: "agents", icon: "🤖", label: "Agents" },
  { id: "docs", icon: "📚", label: "Docs" },
  { id: "skills", icon: "🧩", label: "Skills" },
];

function App() {
  const { user, token, loading: authLoading, isAuthenticated, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Startups state
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(false);
  const [researchTopic, setResearchTopic] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);

  // Docs state
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);

  // Agents state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [newAgentSchedule, setNewAgentSchedule] = useState("");
  const [newAgentSkillIds, setNewAgentSkillIds] = useState<string[]>([]);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [agentRunResult, setAgentRunResult] = useState<{ agentId: string; result: string } | null>(null);
  const [docsAgentFilter, setDocsAgentFilter] = useState<string>("");
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const [agentRuns, setAgentRuns] = useState<Record<string, AgentRun[]>>({});
  const [runsLoading, setRunsLoading] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Skills state
  interface Skill {
    id: string;
    name: string;
    description: string;
    instructions: string;
    tags: string[];
    invocation: "auto" | "user" | "agent";
    resources: string[];
    createdAt: string;
    updatedAt: string;
  }
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillForm, setSkillForm] = useState({ name: "", description: "", instructions: "", tags: "", invocation: "auto" });
  const [editingSkill, setEditingSkill] = useState<string | null>(null);

  const getAuthHeaders = (): HeadersInit => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  useEffect(() => {
    if (activeTab === "startups" && isAuthenticated) fetchStartups();
    if (activeTab === "docs" && isAuthenticated) fetchDocs();
    if (activeTab === "agents" && isAuthenticated) fetchAgents();
    if (activeTab === "skills" && isAuthenticated) fetchSkills();
  }, [activeTab, isAuthenticated]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // ── Startups ──────────────────────────────────────────────────────────────
  const fetchStartups = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/startups`, { headers: getAuthHeaders() });
      const data = await res.json();
      setStartups(data.startups || []);
    } catch (err) {
      console.error("Error fetching startups:", err);
    } finally {
      setLoading(false);
    }
  };

  const startResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchTopic.trim() || researching || !token) return;
    setResearching(true);
    setResearchResult(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
      const res = await fetch(RESEARCH_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ topic: researchTopic }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResearchResult(data);
      fetchStartups();
    } catch (err) {
      setResearchResult({
        success: false, startupsFound: [], count: 0,
        summary: `Error: ${err instanceof Error ? err.message : "Research failed"}`,
      });
    } finally {
      setResearching(false);
    }
  };

  // ── Docs ──────────────────────────────────────────────────────────────────
  const fetchDocs = async (agentId?: string) => {
    if (!token) return;
    if (docs.length === 0) setDocsLoading(true);
    try {
      const filterParam = agentId ? `?agentId=${agentId}` : "";
      const res = await fetch(`${API_URL}/docs${filterParam}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setDocs(data.docs || []);
    } catch (err) {
      console.error("Error fetching docs:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!token || !confirm("Delete this document?")) return;
    try {
      await fetch(`${API_URL}/docs/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setDocs(docs.filter(d => d.id !== id));
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      console.error("Error deleting doc:", err);
    }
  };

  // ── Agents ────────────────────────────────────────────────────────────────
  const fetchAgents = async () => {
    if (!token) return;
    if (agents.length === 0) setAgentsLoading(true);
    try {
      const res = await fetch(`${API_URL}/agents`, { headers: getAuthHeaders() });
      const data = await res.json();
      const agentsList = data.agents || [];
      const agentsWithDocs = await Promise.all(
        agentsList.map(async (agent: Agent) => {
          try {
            const docsRes = await fetch(`${API_URL}/docs?agentId=${agent.id}`, { headers: getAuthHeaders() });
            const docsData = await docsRes.json();
            return { ...agent, docs: docsData.docs || [] };
          } catch {
            return { ...agent, docs: [] };
          }
        })
      );
      setAgents(agentsWithDocs);
    } catch (err) {
      console.error("Error fetching agents:", err);
    } finally {
      setAgentsLoading(false);
    }
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newAgentName.trim() || !newAgentPrompt.trim()) return;
    try {
      const res = await fetch(`${API_URL}/agents`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newAgentName, prompt: newAgentPrompt, schedule: newAgentSchedule || undefined, skillIds: newAgentSkillIds }),
      });
      const data = await res.json();
      if (data.id) {
        setAgents([data, ...agents]);
        setNewAgentName("");
        setNewAgentPrompt("");
        setNewAgentSchedule("");
        setNewAgentSkillIds([]);
      }
    } catch (err) {
      console.error("Error creating agent:", err);
    }
  };

  const runAgent = async (agentId: string) => {
    if (!token || runningAgent) return;
    setRunningAgent(agentId);
    setAgentRunResult(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(AGENT_RUNNER_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ agentId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setAgentRunResult({ agentId, result: data.result || data.error || "Complete" });
      fetchAgents();
      fetchDocs(docsAgentFilter || undefined);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("Load failed") || errMsg.includes("abort") || errMsg.includes("network")) {
        setAgentRunResult({ agentId, result: "⏳ Agent may still be running... Refreshing docs in a moment." });
        setTimeout(() => { fetchAgents(); fetchDocs(docsAgentFilter || undefined); }, 5000);
      } else {
        setAgentRunResult({ agentId, result: `Error: ${errMsg}` });
      }
    } finally {
      setRunningAgent(null);
    }
  };

  const deleteAgent = async (id: string) => {
    if (!token || !confirm("Delete this agent?")) return;
    try {
      await fetch(`${API_URL}/agents/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setAgents(agents.filter(a => a.id !== id));
    } catch (err) {
      console.error("Error deleting agent:", err);
    }
  };

  const fetchRuns = async (agentId: string) => {
    if (!token) return;
    setRunsLoading(agentId);
    try {
      const res = await fetch(`${API_URL}/agents/${agentId}/runs`, { headers: getAuthHeaders() });
      const data = await res.json();
      setAgentRuns(prev => ({ ...prev, [agentId]: data.runs || [] }));
    } catch (err) {
      console.error("Error fetching runs:", err);
    } finally {
      setRunsLoading(null);
    }
  };

  const toggleRuns = (agentId: string) => {
    if (expandedRuns === agentId) {
      setExpandedRuns(null);
    } else {
      setExpandedRuns(agentId);
      if (!agentRuns[agentId]) fetchRuns(agentId);
    }
  };

  // ── Skills ─────────────────────────────────────────────────────────────────
  const fetchSkills = async () => {
    if (!token) return;
    if (skills.length === 0) setSkillsLoading(true);
    try {
      const res = await fetch(`${API_URL}/skills`, { headers: getAuthHeaders() });
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (err) {
      console.error("Error fetching skills:", err);
    } finally {
      setSkillsLoading(false);
    }
  };

  const createSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !skillForm.name.trim() || !skillForm.instructions.trim()) return;
    try {
      const res = await fetch(`${API_URL}/skills`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: skillForm.name,
          description: skillForm.description,
          instructions: skillForm.instructions,
          tags: skillForm.tags.split(",").map(t => t.trim()).filter(Boolean),
          invocation: skillForm.invocation,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setSkills([data, ...skills]);
        setSkillForm({ name: "", description: "", instructions: "", tags: "", invocation: "auto" });
      }
    } catch (err) {
      console.error("Error creating skill:", err);
    }
  };

  const updateSkill = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/skills/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: skillForm.name,
          description: skillForm.description,
          instructions: skillForm.instructions,
          tags: skillForm.tags.split(",").map(t => t.trim()).filter(Boolean),
          invocation: skillForm.invocation,
        }),
      });
      const data = await res.json();
      setSkills(skills.map(s => s.id === id ? data : s));
      setEditingSkill(null);
      setSelectedSkill(data);
      setSkillForm({ name: "", description: "", instructions: "", tags: "", invocation: "auto" });
    } catch (err) {
      console.error("Error updating skill:", err);
    }
  };

  const deleteSkill = async (id: string) => {
    if (!token || !confirm("Delete this skill?")) return;
    try {
      await fetch(`${API_URL}/skills/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setSkills(skills.filter(s => s.id !== id));
      if (selectedSkill?.id === id) setSelectedSkill(null);
    } catch (err) {
      console.error("Error deleting skill:", err);
    }
  };

  const startEditSkill = (skill: Skill) => {
    setEditingSkill(skill.id);
    setSkillForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      tags: skill.tags?.join(", ") || "",
      invocation: skill.invocation || "auto",
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="login-screen">
        <span style={{ color: "#777", fontSize: 18 }}>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <h1 style={{ fontSize: 48, margin: 0 }}>🏭</h1>
        <h1>FactoryBot</h1>
        <p>AI-powered research agents. Create bots that search, analyze, and save findings automatically.</p>
        <button className="btn btn-primary" onClick={login} style={{ padding: "12px 32px", fontSize: 16 }}>
          Login to Continue
        </button>
      </div>
    );
  }

  const currentNav = NAV_ITEMS.find(n => n.id === activeTab);

  return (
    <div className="app-layout">
      {/* Backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <input
            type="text"
            className="sidebar-search"
            placeholder="Search..."
          />
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => switchTab(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user?.picture && <img src={user.picture} alt="" className="sidebar-avatar" />}
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || user?.email}</div>
          </div>
          <button className="sidebar-logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-area">
        <div className="top-bar">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <span className="top-bar-title">{currentNav?.icon} {currentNav?.label}</span>
        </div>

        <div className="main-content">
          {activeTab === "chat" && <Chat token={token} />}

          {activeTab === "research" && (
            <div className="section-content">
              <div className="card">
                <h2 style={{ marginBottom: 16 }}>🚀 Quick Research</h2>
                <p style={{ color: "#999", marginBottom: 20 }}>
                  Enter a topic and the research agent will search the web, find relevant startups, and save them.
                </p>
                <form onSubmit={startResearch} style={{ marginBottom: 24 }}>
                  <div className="form-row">
                    <input
                      type="text"
                      value={researchTopic}
                      onChange={(e) => setResearchTopic(e.target.value)}
                      placeholder="e.g., AI coding assistants, vertical SaaS..."
                      disabled={researching}
                      style={{ flex: 2 }}
                    />
                    <button type="submit" className="btn btn-primary" disabled={researching || !researchTopic.trim()} style={{ minWidth: 150 }}>
                      {researching ? "🔍 Researching..." : "🚀 Start"}
                    </button>
                  </div>
                </form>

                {researching && (
                  <div className="card card-light" style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                    <h3>Research in Progress...</h3>
                    <p style={{ color: "#777" }}>This may take 30-60 seconds.</p>
                  </div>
                )}

                {researchResult && (
                  <div className="card" style={{ background: researchResult.success ? "#0d2818" : "#2d1111", borderColor: researchResult.success ? "#166534" : "#991b1b" }}>
                    <h3>{researchResult.success ? "✅ Complete!" : "❌ Failed"}</h3>
                    {researchResult.startupsFound.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <strong>Found ({researchResult.count}):</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                          {researchResult.startupsFound.map((name, i) => <li key={i}>{name}</li>)}
                        </ul>
                      </div>
                    )}
                    <p style={{ whiteSpace: "pre-wrap" }}>{researchResult.summary}</p>
                  </div>
                )}

                <div style={{ marginTop: 24, padding: 16, background: "#333", borderRadius: 8 }}>
                  <h4 style={{ marginBottom: 8 }}>💡 Ideas</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["AI coding assistants", "Developer tools", "AI agents", "No-code platforms"].map((idea) => (
                      <button key={idea} className="btn btn-secondary" onClick={() => setResearchTopic(idea)} style={{ fontSize: 13 }}>
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "startups" && (
            <div className="section-content">
              <div className="card">
                <div className="form-row">
                  <input type="text" placeholder="Search startups..." />
                  <button className="btn btn-primary" onClick={fetchStartups}>Refresh</button>
                </div>
              </div>
              {loading ? (
                <div className="loading">Loading startups...</div>
              ) : startups.length === 0 ? (
                <div className="empty">
                  <p>No startups yet!</p>
                  <p style={{ marginTop: 8, fontSize: 14 }}>Go to Research tab to find and add startups.</p>
                </div>
              ) : (
                <div className="startup-grid">
                  {startups.map((startup) => (
                    <div key={startup.id} className="startup-card">
                      <h3>
                        {startup.name}
                        {startup.website && (
                          <a href={startup.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#10a37f", marginLeft: 8 }}>↗</a>
                        )}
                      </h3>
                      {startup.description && <p className="description">{startup.description}</p>}
                      <div className="tags">
                        {(Array.isArray(startup.industries) ? startup.industries : []).map((ind) => (
                          <span key={ind} className="tag">{ind}</span>
                        ))}
                      </div>
                      <div className="meta">Added: {startup.createdAt ? new Date(startup.createdAt).toLocaleDateString() : "Unknown"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "agents" && (
            <div className="section-content">
              {/* Create Agent Form */}
              <div className="card">
                <h3 style={{ marginBottom: 12 }}>➕ Create Agent</h3>
                <form onSubmit={createAgent}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input type="text" placeholder="Agent name" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} />
                    <textarea placeholder="Research prompt..." value={newAgentPrompt} onChange={(e) => setNewAgentPrompt(e.target.value)} rows={3} />
                    {skills.length > 0 && (
                      <div>
                        <label style={{ fontSize: 13, color: "#999", marginBottom: 4, display: "block" }}>🧩 Attach Skills</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {skills.map(skill => (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => setNewAgentSkillIds(prev => prev.includes(skill.id) ? prev.filter(id => id !== skill.id) : [...prev, skill.id])}
                              className={`btn ${newAgentSkillIds.includes(skill.id) ? "btn-primary" : "btn-secondary"}`}
                              style={{ fontSize: 12, padding: "4px 10px" }}
                            >
                              {newAgentSkillIds.includes(skill.id) ? "✅" : "⬜"} /{skill.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="form-row">
                      <input type="text" placeholder="Schedule (optional)" value={newAgentSchedule} onChange={(e) => setNewAgentSchedule(e.target.value)} style={{ flex: 1 }} />
                      <button type="submit" className="btn btn-primary" disabled={!newAgentName.trim() || !newAgentPrompt.trim()}>Create Agent</button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Agents List */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0 }}>🤖 Your Agents</h3>
                  <button className="btn btn-secondary" onClick={fetchAgents} style={{ fontSize: 13 }}>Refresh</button>
                </div>
                {agentsLoading ? (
                  <div className="loading">Loading agents...</div>
                ) : agents.length === 0 ? (
                  <div className="empty">
                    <p>No agents yet!</p>
                    <p style={{ marginTop: 8, fontSize: 14 }}>Create an agent above to automate research.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {agents.map((agent) => (
                      <div key={agent.id} className="card card-light">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: "0 0 8px 0" }}>{agent.name}</h4>
                            <p style={{ color: "#999", fontSize: 14, margin: "0 0 8px 0" }}>{agent.prompt}</p>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {agent.schedule && <span className="tag tag-blue">⏰ {agent.schedule}</span>}
                              {agent.cronExpression && <span className="tag tag-purple">cron: {agent.cronExpression}</span>}
                              {agent.skillIds && agent.skillIds.length > 0 && agent.skillIds.map(sid => {
                                const sk = skills.find(s => s.id === sid);
                                return sk ? <span key={sid} className="tag" style={{ background: "#1e3a5f", color: "#93c5fd" }}>🧩 /{sk.name}</span> : null;
                              })}
                              {agent.lastRun && <span className="tag">Last: {new Date(agent.lastRun).toLocaleString()}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                            <button className="btn btn-primary" onClick={() => runAgent(agent.id)} disabled={runningAgent === agent.id} style={{ fontSize: 13 }}>
                              {runningAgent === agent.id ? "⏳ Running..." : "▶️ Run"}
                            </button>
                            <button className="btn btn-secondary" onClick={() => deleteAgent(agent.id)} style={{ fontSize: 13, color: "#ef4444" }}>🗑️</button>
                          </div>
                        </div>
                        {agentRunResult?.agentId === agent.id && (
                          <div style={{ marginTop: 12, padding: 12, background: "#2a2a2a", borderRadius: 8, border: "1px solid #444" }}>
                            <strong>Result:</strong>
                            <p style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 14 }}>{agentRunResult.result}</p>
                          </div>
                        )}
                        {agent.docs && agent.docs.length > 0 && (
                          <div style={{ marginTop: 12, borderTop: "1px solid #444", paddingTop: 12 }}>
                            <strong style={{ fontSize: 13 }}>📄 Documents ({agent.docs.length})</strong>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                              {agent.docs.slice(0, 5).map((doc) => (
                                <div key={doc.id} onClick={() => { setSelectedDoc(doc); setActiveTab("docs"); }} style={{ padding: 8, background: "#2a2a2a", borderRadius: 6, cursor: "pointer", border: "1px solid #444", fontSize: 13 }}>
                                  <div style={{ fontWeight: 500 }}>{doc.title}</div>
                                  <div style={{ color: "#777", fontSize: 12 }}>{doc.description?.slice(0, 60)}{doc.description && doc.description.length > 60 ? "..." : ""}</div>
                                </div>
                              ))}
                              {agent.docs.length > 5 && <div style={{ fontSize: 12, color: "#777" }}>+{agent.docs.length - 5} more docs</div>}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 12, borderTop: "1px solid #444", paddingTop: 8 }}>
                          <button className="btn btn-secondary" onClick={() => toggleRuns(agent.id)} style={{ fontSize: 12, padding: "4px 10px" }}>
                            {expandedRuns === agent.id ? "▼" : "▶"} Run History{agentRuns[agent.id] ? ` (${agentRuns[agent.id].length})` : ""}
                          </button>
                          {expandedRuns === agent.id && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              {runsLoading === agent.id ? (
                                <div style={{ fontSize: 13, color: "#777" }}>Loading runs...</div>
                              ) : !agentRuns[agent.id]?.length ? (
                                <div style={{ fontSize: 13, color: "#777" }}>No runs yet</div>
                              ) : (
                                agentRuns[agent.id].map((run) => (
                                  <details key={run.runId} style={{ background: "#2a2a2a", borderRadius: 6, border: "1px solid #444", fontSize: 13 }}>
                                    <summary style={{ padding: 8, cursor: "pointer", color: "#b4b4b4" }}>
                                      {run.status === "completed" ? "✅" : "❌"} {new Date(run.createdAt).toLocaleString()}
                                    </summary>
                                    <div style={{ padding: "0 8px 8px", whiteSpace: "pre-wrap", color: "#999", maxHeight: 200, overflow: "auto" }}>
                                      {run.result || "No result"}
                                    </div>
                                  </details>
                                ))
                              )}
                              <button className="btn btn-secondary" onClick={() => fetchRuns(agent.id)} style={{ fontSize: 11, padding: "2px 8px", alignSelf: "flex-start" }}>🔄 Refresh</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "docs" && (
            <div className="section-content">
              <div style={{ display: "grid", gridTemplateColumns: selectedDoc ? "1fr 1fr" : "1fr", gap: 16 }}>
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <h3 style={{ margin: 0 }}>📄 Documents ({docs.length})</h3>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={docsAgentFilter} onChange={(e) => { setDocsAgentFilter(e.target.value); fetchDocs(e.target.value || undefined); }} style={{ fontSize: 13, padding: "6px 10px" }}>
                        <option value="">All Agents</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button className="btn btn-secondary" onClick={() => fetchDocs(docsAgentFilter || undefined)} style={{ fontSize: 13 }}>Refresh</button>
                    </div>
                  </div>

                  {docs.length > 0 && (() => {
                    const allTags = [...new Set(docs.flatMap(d => d.tags || []).filter(t => t && t.length > 1))].sort();
                    return allTags.length > 0 ? (
                      <div style={{ marginBottom: 12 }}>
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 13, padding: "6px 12px", background: selectedTags.size > 0 ? "#1e3a5f" : "#333", border: "1px solid #444", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6, color: "#b4b4b4", listStyle: "none" }}>
                            🏷️ Tags {selectedTags.size > 0 ? `(${selectedTags.size})` : ""}
                          </summary>
                          <div style={{ marginTop: 4, background: "#333", border: "1px solid #444", borderRadius: 8, padding: 8, maxHeight: 250, overflowY: "auto" }}>
                            {selectedTags.size > 0 && (
                              <button onClick={() => setSelectedTags(new Set())} style={{ fontSize: 12, color: "#777", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", marginBottom: 6, display: "block" }}>Clear all</button>
                            )}
                            {allTags.map(tag => (
                              <label key={tag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", fontSize: 13, cursor: "pointer", color: "#b4b4b4" }}>
                                <input type="checkbox" checked={selectedTags.has(tag)} onChange={() => { const next = new Set(selectedTags); next.has(tag) ? next.delete(tag) : next.add(tag); setSelectedTags(next); }} />
                                {tag}
                              </label>
                            ))}
                          </div>
                        </details>
                      </div>
                    ) : null;
                  })()}

                  {docsLoading ? (
                    <div className="loading">Loading docs...</div>
                  ) : docs.length === 0 ? (
                    <div className="empty">
                      <p>No documents yet!</p>
                      <p style={{ marginTop: 8, fontSize: 14 }}>Run an agent to generate research documents.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {docs.filter(doc => selectedTags.size === 0 || (doc.tags || []).some(t => selectedTags.has(t))).map((doc) => (
                        <div key={doc.id} onClick={() => setSelectedDoc(doc)} style={{ padding: 12, background: selectedDoc?.id === doc.id ? "#1e3a5f" : "#333", borderRadius: 8, cursor: "pointer", border: selectedDoc?.id === doc.id ? "2px solid #10a37f" : "1px solid #444" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <h4 style={{ margin: 0, fontSize: 14 }}>{doc.title}</h4>
                            <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }} style={{ fontSize: 11, padding: "2px 6px", color: "#ef4444" }}>🗑️</button>
                          </div>
                          <p style={{ color: "#999", fontSize: 13, margin: "4px 0", lineHeight: 1.4 }}>{doc.description?.slice(0, 100)}{doc.description && doc.description.length > 100 ? "..." : ""}</p>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {doc.tags?.slice(0, 3).map((tag) => <span key={tag} className="tag" style={{ fontSize: 11 }}>{tag}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDoc && (
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <h3 style={{ margin: 0 }}>{selectedDoc.title}</h3>
                      <button className="btn btn-secondary" onClick={() => setSelectedDoc(null)} style={{ fontSize: 13 }}>✕</button>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <strong>Description:</strong>
                      <p style={{ color: "#999", marginTop: 4 }}>{selectedDoc.description}</p>
                    </div>
                    {selectedDoc.tags?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Tags:</strong>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {selectedDoc.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                        </div>
                      </div>
                    )}
                    {selectedDoc.sourceUrl && (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Source:</strong>{" "}
                        <a href={selectedDoc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#10a37f" }}>{selectedDoc.sourceUrl}</a>
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <strong>Created:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}
                    </div>
                    {selectedDoc.content && (
                      <div>
                        <strong>Content:</strong>
                        <div style={{ marginTop: 8, padding: 12, background: "#333", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 14, maxHeight: 400, overflow: "auto", color: "#b4b4b4" }}>
                          {selectedDoc.content}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === "skills" && (
            <div className="section-content">
              {/* Create / Edit Skill Form */}
              <div className="card">
                <h3 style={{ marginBottom: 12 }}>{editingSkill ? "✏️ Edit Skill" : "➕ Create Skill"}</h3>
                <form onSubmit={(e) => { e.preventDefault(); editingSkill ? updateSkill(editingSkill) : createSkill(e); }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input
                      type="text"
                      placeholder="Skill name (e.g., code-reviewer)"
                      value={skillForm.name}
                      onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Short description"
                      value={skillForm.description}
                      onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                    />
                    <textarea
                      placeholder="Instructions (SKILL.md content — what Claude should do when this skill is invoked)"
                      value={skillForm.instructions}
                      onChange={(e) => setSkillForm({ ...skillForm, instructions: e.target.value })}
                      rows={6}
                      style={{ fontFamily: "monospace", fontSize: 13 }}
                    />
                    <div className="form-row">
                      <input
                        type="text"
                        placeholder="Tags (comma-separated)"
                        value={skillForm.tags}
                        onChange={(e) => setSkillForm({ ...skillForm, tags: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <select
                        value={skillForm.invocation}
                        onChange={(e) => setSkillForm({ ...skillForm, invocation: e.target.value })}
                        style={{ minWidth: 120 }}
                      >
                        <option value="auto">Auto</option>
                        <option value="user">User only</option>
                        <option value="agent">Agent only</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={!skillForm.name.trim() || !skillForm.instructions.trim()}>
                        {editingSkill ? "Save Changes" : "Create Skill"}
                      </button>
                      {editingSkill && (
                        <button type="button" className="btn btn-secondary" onClick={() => {
                          setEditingSkill(null);
                          setSkillForm({ name: "", description: "", instructions: "", tags: "", invocation: "auto" });
                        }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {/* Skills List */}
              <div style={{ display: "grid", gridTemplateColumns: selectedSkill && !editingSkill ? "1fr 1fr" : "1fr", gap: 16 }}>
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>🧩 Your Skills ({skills.length})</h3>
                    <button className="btn btn-secondary" onClick={fetchSkills} style={{ fontSize: 13 }}>Refresh</button>
                  </div>
                  {skillsLoading ? (
                    <div className="loading">Loading skills...</div>
                  ) : skills.length === 0 ? (
                    <div className="empty">
                      <p>No skills yet!</p>
                      <p style={{ marginTop: 8, fontSize: 14 }}>Create a skill above to extend your agents' capabilities.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {skills.map((skill) => (
                        <div
                          key={skill.id}
                          onClick={() => { setSelectedSkill(skill); setEditingSkill(null); }}
                          style={{
                            padding: 12,
                            background: selectedSkill?.id === skill.id ? "#1e3a5f" : "#333",
                            borderRadius: 8,
                            cursor: "pointer",
                            border: selectedSkill?.id === skill.id ? "2px solid #10a37f" : "1px solid #444",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: 14 }}>/{skill.name}</h4>
                              {skill.description && (
                                <p style={{ color: "#999", fontSize: 13, margin: "4px 0", lineHeight: 1.4 }}>
                                  {skill.description.slice(0, 100)}{skill.description.length > 100 ? "..." : ""}
                                </p>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                className="btn btn-secondary"
                                onClick={(e) => { e.stopPropagation(); startEditSkill(skill); }}
                                style={{ fontSize: 11, padding: "2px 6px" }}
                              >✏️</button>
                              <button
                                className="btn btn-secondary"
                                onClick={(e) => { e.stopPropagation(); deleteSkill(skill.id); }}
                                style={{ fontSize: 11, padding: "2px 6px", color: "#ef4444" }}
                              >🗑️</button>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                            <span className="tag tag-purple" style={{ fontSize: 11 }}>{skill.invocation || "auto"}</span>
                            {skill.tags?.slice(0, 3).map((tag) => (
                              <span key={tag} className="tag" style={{ fontSize: 11 }}>{tag}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Skill Detail Panel */}
                {selectedSkill && !editingSkill && (
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <h3 style={{ margin: 0 }}>/{selectedSkill.name}</h3>
                      <button className="btn btn-secondary" onClick={() => setSelectedSkill(null)} style={{ fontSize: 13 }}>✕</button>
                    </div>
                    {selectedSkill.description && (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Description:</strong>
                        <p style={{ color: "#999", marginTop: 4 }}>{selectedSkill.description}</p>
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <strong>Invocation:</strong>{" "}
                      <span className="tag tag-purple">{selectedSkill.invocation || "auto"}</span>
                    </div>
                    {selectedSkill.tags?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Tags:</strong>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {selectedSkill.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <strong>Created:</strong> {new Date(selectedSkill.createdAt).toLocaleString()}
                    </div>
                    <div>
                      <strong>Instructions (SKILL.md):</strong>
                      <div style={{
                        marginTop: 8,
                        padding: 12,
                        background: "#333",
                        borderRadius: 8,
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        fontFamily: "monospace",
                        maxHeight: 400,
                        overflow: "auto",
                        color: "#b4b4b4",
                        lineHeight: 1.6,
                      }}>
                        {selectedSkill.instructions}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
