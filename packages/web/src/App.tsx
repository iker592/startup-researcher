import { useState, useEffect } from "react";
import { Chat } from "./Chat";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";
// Use Function URL for research (bypasses API Gateway 30s timeout)
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

interface ResearchResult {
  success: boolean;
  startupsFound: string[];
  count: number;
  summary: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "startups" | "research">("chat");
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(false);
  const [researchTopic, setResearchTopic] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);

  // Fetch startups when tab changes
  useEffect(() => {
    if (activeTab === "startups") {
      fetchStartups();
    }
  }, [activeTab]);

  const fetchStartups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/startups`);
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
    if (!researchTopic.trim() || researching) return;

    setResearching(true);
    setResearchResult(null);

    try {
      // Research can take several minutes with Function URL (10 min timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min timeout
      
      const res = await fetch(RESEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: researchTopic }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setResearchResult(data);
      // Refresh startups list
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

  return (
    <div className="container">
      <div className="header">
        <h1>🔍 Startup Researcher</h1>
        <div className="tabs">
          <button
            className={`tab ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            💬 Chat
          </button>
          <button
            className={`tab ${activeTab === "research" ? "active" : ""}`}
            onClick={() => setActiveTab("research")}
          >
            🤖 Research
          </button>
          <button
            className={`tab ${activeTab === "startups" ? "active" : ""}`}
            onClick={() => setActiveTab("startups")}
          >
            🚀 Startups ({startups.length})
          </button>
        </div>
      </div>

      {/* Chat Tab - AG-UI Streaming */}
      {activeTab === "chat" && <Chat />}

      {/* Research Tab */}
      {activeTab === "research" && (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>🤖 Research Agent</h2>
          <p style={{ color: "#666", marginBottom: 20 }}>
            Enter a topic and the research agent will search the web, find relevant startups,
            and save them to the database.
          </p>
          
          <form onSubmit={startResearch} style={{ marginBottom: 24 }}>
            <div className="form-row">
              <input
                type="text"
                value={researchTopic}
                onChange={(e) => setResearchTopic(e.target.value)}
                placeholder="e.g., AI coding assistants, vertical SaaS, developer tools..."
                disabled={researching}
                style={{ flex: 2 }}
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={researching || !researchTopic.trim()}
                style={{ minWidth: 150 }}
              >
                {researching ? "🔍 Researching..." : "🚀 Start Research"}
              </button>
            </div>
          </form>

          {researching && (
            <div className="card" style={{ background: "#f0f9ff", textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <h3>Research in Progress...</h3>
              <p style={{ color: "#666" }}>
                The agent is searching the web, extracting startup info, and saving to the database.
                This may take 30-60 seconds.
              </p>
            </div>
          )}

          {researchResult && (
            <div className="card" style={{ 
              background: researchResult.success ? "#f0fdf4" : "#fef2f2" 
            }}>
              <h3 style={{ marginBottom: 12 }}>
                {researchResult.success ? "✅ Research Complete!" : "❌ Research Failed"}
              </h3>
              
              {researchResult.success && researchResult.startupsFound.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <strong>Startups Found ({researchResult.count}):</strong>
                  <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                    {researchResult.startupsFound.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <strong>Summary:</strong>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{researchResult.summary}</p>
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
            <h4 style={{ marginBottom: 8 }}>💡 Research Ideas</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                "AI coding assistants",
                "Vertical SaaS for healthcare",
                "Developer productivity tools",
                "AI agents startups",
                "No-code platforms",
                "AI writing assistants",
              ].map((idea) => (
                <button
                  key={idea}
                  className="btn btn-secondary"
                  onClick={() => setResearchTopic(idea)}
                  style={{ fontSize: 13 }}
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Startups Tab */}
      {activeTab === "startups" && (
        <>
          <div className="card">
            <div className="form-row">
              <input type="text" placeholder="Search startups..." />
              <select>
                <option value="">All Industries</option>
                <option value="ai">AI</option>
                <option value="developer-tools">Developer Tools</option>
                <option value="fintech">Fintech</option>
                <option value="healthtech">Healthtech</option>
              </select>
              <button className="btn btn-primary" onClick={fetchStartups}>
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading startups...</div>
          ) : startups.length === 0 ? (
            <div className="empty">
              <p>No startups yet!</p>
              <p style={{ marginTop: 8, fontSize: 14 }}>
                Go to the Research tab to find and add startups.
              </p>
            </div>
          ) : (
            <div className="startup-grid">
              {startups.map((startup) => (
                <div key={startup.id} className="startup-card">
                  <h3>
                    {startup.name}
                    {startup.website && (
                      <a
                        href={startup.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 14, color: "#4f46e5", marginLeft: 8 }}
                      >
                        ↗
                      </a>
                    )}
                  </h3>
                  {startup.description && (
                    <p className="description">{startup.description}</p>
                  )}
                  <div className="tags">
                    {(Array.isArray(startup.industries) 
                      ? startup.industries 
                      : []
                    ).map((ind) => (
                      <span key={ind} className="tag">
                        {ind}
                      </span>
                    ))}
                    {startup.source === "research-agent" && (
                      <span className="tag" style={{ background: "#dbeafe", color: "#1e40af" }}>
                        🤖 auto
                      </span>
                    )}
                  </div>
                  <div className="meta">
                    Added: {startup.createdAt ? new Date(startup.createdAt).toLocaleDateString() : "Unknown"}
                  </div>
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
