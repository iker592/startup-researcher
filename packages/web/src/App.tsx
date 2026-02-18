import { useState, useEffect } from "react";
import { Chat } from "./Chat";
import { useAuth } from "./useAuth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";
const RESEARCH_URL = import.meta.env.VITE_RESEARCH_URL || `${API_URL}/research`;

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
}

interface ResearchResult {
  success: boolean;
  startupsFound: string[];
  count: number;
  summary: string;
}

function App() {
  const { user, token, loading: authLoading, isAuthenticated, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "agents" | "docs" | "research" | "startups">("chat");
  
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
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [agentRunResult, setAgentRunResult] = useState<{ agentId: string; result: string } | null>(null);

  // Helper to get auth headers
  const getAuthHeaders = (): HeadersInit => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  // Fetch data when tabs change
  useEffect(() => {
    if (activeTab === "startups" && isAuthenticated) fetchStartups();
    if (activeTab === "docs" && isAuthenticated) fetchDocs();
    if (activeTab === "agents" && isAuthenticated) fetchAgents();
  }, [activeTab, isAuthenticated]);

  // ============================================================================
  // Startups
  // ============================================================================
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
        success: false,
        startupsFound: [],
        count: 0,
        summary: `Error: ${err instanceof Error ? err.message : "Research failed"}`,
      });
    } finally {
      setResearching(false);
    }
  };

  // ============================================================================
  // Docs
  // ============================================================================
  const fetchDocs = async () => {
    if (!token) return;
    setDocsLoading(true);
    try {
      const res = await fetch(`${API_URL}/docs`, { headers: getAuthHeaders() });
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

  // ============================================================================
  // Agents
  // ============================================================================
  const fetchAgents = async () => {
    if (!token) return;
    setAgentsLoading(true);
    try {
      const res = await fetch(`${API_URL}/agents`, { headers: getAuthHeaders() });
      const data = await res.json();
      setAgents(data.agents || []);
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
        body: JSON.stringify({
          name: newAgentName,
          prompt: newAgentPrompt,
          schedule: newAgentSchedule || undefined,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setAgents([data, ...agents]);
        setNewAgentName("");
        setNewAgentPrompt("");
        setNewAgentSchedule("");
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
      const res = await fetch(`${API_URL}/agents/${agentId}/run`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setAgentRunResult({ agentId, result: data.result || data.message || "Complete" });
      // Refresh docs in case agent saved any
      fetchDocs();
    } catch (err) {
      setAgentRunResult({ agentId, result: `Error: ${err}` });
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

  // ============================================================================
  // Render
  // ============================================================================
  if (authLoading) {
    return (
      <div className="container">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
          <span style={{ color: "#666", fontSize: 18 }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container">
        <div style={{ 
          display: "flex", flexDirection: "column", justifyContent: "center", 
          alignItems: "center", minHeight: "60vh", gap: 24 
        }}>
          <h1 style={{ margin: 0, fontSize: 48 }}>🔍</h1>
          <h1 style={{ margin: 0 }}>Startup Researcher</h1>
          <p style={{ color: "#666", textAlign: "center", maxWidth: 400 }}>
            AI-powered startup research and analysis. Chat with your database, discover new startups, and track the market.
          </p>
          <button className="btn btn-primary" onClick={login} style={{ padding: "12px 32px", fontSize: 16 }}>
            Login to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>🔍 Startup Researcher</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user?.picture && (
              <img src={user.picture} alt={user.name || "User"} style={{ width: 32, height: 32, borderRadius: "50%" }} />
            )}
            <span>{user?.name || user?.email}</span>
            <button className="btn btn-secondary" onClick={logout} style={{ padding: "6px 12px", fontSize: 13 }}>Logout</button>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>💬 Chat</button>
          <button className={`tab ${activeTab === "agents" ? "active" : ""}`} onClick={() => setActiveTab("agents")}>🤖 Agents</button>
          <button className={`tab ${activeTab === "docs" ? "active" : ""}`} onClick={() => setActiveTab("docs")}>📄 Docs</button>
          <button className={`tab ${activeTab === "research" ? "active" : ""}`} onClick={() => setActiveTab("research")}>🔬 Research</button>
          <button className={`tab ${activeTab === "startups" ? "active" : ""}`} onClick={() => setActiveTab("startups")}>🚀 Startups</button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Chat Tab */}
      {/* ================================================================== */}
      {activeTab === "chat" && <Chat token={token} />}

      {/* ================================================================== */}
      {/* Agents Tab */}
      {/* ================================================================== */}
      {activeTab === "agents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Create Agent Form */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>➕ Create Agent</h3>
            <form onSubmit={createAgent}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                  type="text"
                  placeholder="Agent name (e.g., AI News Researcher)"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                />
                <textarea
                  placeholder="Research prompt (e.g., Find the latest AI coding assistant startups...)"
                  value={newAgentPrompt}
                  onChange={(e) => setNewAgentPrompt(e.target.value)}
                  rows={3}
                  style={{ resize: "vertical" }}
                />
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Schedule (optional): daily at 9, weekly on monday at 10"
                    value={newAgentSchedule}
                    onChange={(e) => setNewAgentSchedule(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={!newAgentName.trim() || !newAgentPrompt.trim()}>
                    Create Agent
                  </button>
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
                  <div key={agent.id} className="card" style={{ background: "#f9fafb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: "0 0 8px 0" }}>{agent.name}</h4>
                        <p style={{ color: "#666", fontSize: 14, margin: "0 0 8px 0" }}>{agent.prompt}</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {agent.schedule && (
                            <span className="tag" style={{ background: "#dbeafe", color: "#1e40af" }}>
                              ⏰ {agent.schedule}
                            </span>
                          )}
                          {agent.cronExpression && (
                            <span className="tag" style={{ background: "#f3e8ff", color: "#7c3aed" }}>
                              cron: {agent.cronExpression}
                            </span>
                          )}
                          {agent.lastRun && (
                            <span className="tag">Last: {new Date(agent.lastRun).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => runAgent(agent.id)}
                          disabled={runningAgent === agent.id}
                          style={{ fontSize: 13 }}
                        >
                          {runningAgent === agent.id ? "⏳ Running..." : "▶️ Run"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => deleteAgent(agent.id)}
                          style={{ fontSize: 13, color: "#dc2626" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {agentRunResult?.agentId === agent.id && (
                      <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                        <strong>Result:</strong>
                        <p style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 14 }}>{agentRunResult.result}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Docs Tab */}
      {/* ================================================================== */}
      {activeTab === "docs" && (
        <div style={{ display: "grid", gridTemplateColumns: selectedDoc ? "1fr 1fr" : "1fr", gap: 16 }}>
          {/* Docs List */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>📄 Documents ({docs.length})</h3>
              <button className="btn btn-secondary" onClick={fetchDocs} style={{ fontSize: 13 }}>Refresh</button>
            </div>
            
            {docsLoading ? (
              <div className="loading">Loading docs...</div>
            ) : docs.length === 0 ? (
              <div className="empty">
                <p>No documents yet!</p>
                <p style={{ marginTop: 8, fontSize: 14 }}>Run an agent to generate research documents.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    style={{
                      padding: 12,
                      background: selectedDoc?.id === doc.id ? "#eff6ff" : "#f9fafb",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: selectedDoc?.id === doc.id ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <h4 style={{ margin: 0, fontSize: 14 }}>{doc.title}</h4>
                      <button
                        className="btn btn-secondary"
                        onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}
                        style={{ fontSize: 11, padding: "2px 6px", color: "#dc2626" }}
                      >
                        🗑️
                      </button>
                    </div>
                    <p style={{ color: "#666", fontSize: 13, margin: "4px 0", lineHeight: 1.4 }}>
                      {doc.description?.slice(0, 100)}{doc.description && doc.description.length > 100 ? "..." : ""}
                    </p>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {doc.tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="tag" style={{ fontSize: 11 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Doc Detail */}
          {selectedDoc && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>{selectedDoc.title}</h3>
                <button className="btn btn-secondary" onClick={() => setSelectedDoc(null)} style={{ fontSize: 13 }}>✕ Close</button>
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <strong>Description:</strong>
                <p style={{ color: "#666", marginTop: 4 }}>{selectedDoc.description}</p>
              </div>
              
              {selectedDoc.tags?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Tags:</strong>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {selectedDoc.tags.map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedDoc.sourceUrl && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Source:</strong>{" "}
                  <a href={selectedDoc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
                    {selectedDoc.sourceUrl}
                  </a>
                </div>
              )}
              
              <div style={{ marginBottom: 12 }}>
                <strong>Created:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}
              </div>
              
              {selectedDoc.content && (
                <div>
                  <strong>Content:</strong>
                  <div style={{ 
                    marginTop: 8, padding: 12, background: "#f9fafb", borderRadius: 8, 
                    whiteSpace: "pre-wrap", fontSize: 14, maxHeight: 400, overflow: "auto" 
                  }}>
                    {selectedDoc.content}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* Research Tab */}
      {/* ================================================================== */}
      {activeTab === "research" && (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>🔬 Quick Research</h2>
          <p style={{ color: "#666", marginBottom: 20 }}>
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
            <div className="card" style={{ background: "#f0f9ff", textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <h3>Research in Progress...</h3>
              <p style={{ color: "#666" }}>This may take 30-60 seconds.</p>
            </div>
          )}

          {researchResult && (
            <div className="card" style={{ background: researchResult.success ? "#f0fdf4" : "#fef2f2" }}>
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

          <div style={{ marginTop: 24, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
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
      )}

      {/* ================================================================== */}
      {/* Startups Tab */}
      {/* ================================================================== */}
      {activeTab === "startups" && (
        <>
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
                      <a href={startup.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#4f46e5", marginLeft: 8 }}>↗</a>
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
        </>
      )}
    </div>
  );
}

export default App;
