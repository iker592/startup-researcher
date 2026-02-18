import { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

interface Startup {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industries?: string[];
  status?: string;
  createdAt?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "startups">("chat");
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "system",
      content: "👋 I'm your Startup Research Agent. Ask me to research startups, find patterns, or query the database!",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch startups when tab changes
  useEffect(() => {
    if (activeTab === "startups") {
      fetchStartups();
    }
  }, [activeTab]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      // Call agent endpoint (this would connect to your agent)
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || data.message || "I processed your request.",
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // If no agent endpoint, show a demo response
        const demoMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: getDemoResponse(input),
        };
        setMessages((prev) => [...prev, demoMessage]);
      }
    } catch (err) {
      // Demo mode - show what the agent would do
      const demoMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getDemoResponse(input),
      };
      setMessages((prev) => [...prev, demoMessage]);
    } finally {
      setSending(false);
    }
  };

  // Demo responses to show the concept
  const getDemoResponse = (query: string): string => {
    const q = query.toLowerCase();
    
    if (q.includes("research") || q.includes("find")) {
      return `🔍 **Researching...**

I would:
1. Call \`web_scrape\` tool to search for startups matching your query
2. Extract company info, funding data, team members
3. Save to database using \`db_query\` tool

\`\`\`json
{
  "tool": "db_query",
  "operation": "insert",
  "entity": "startup",
  "data": { "name": "...", "description": "..." }
}
\`\`\`

*Connect the agent endpoint to enable live research!*`;
    }
    
    if (q.includes("list") || q.includes("show") || q.includes("startups")) {
      return `📊 **Querying database...**

I would call:
\`\`\`json
{
  "tool": "db_query",
  "operation": "query",
  "entity": "startup"
}
\`\`\`

Check the **Startups** tab to see what's in the database!`;
    }
    
    if (q.includes("pattern") || q.includes("analyze")) {
      return `🧠 **Analyzing patterns...**

I would:
1. Query all startups: \`db_query\` with \`operation: "query"\`
2. Analyze funding rounds, industries, team backgrounds
3. Save patterns: \`db_query\` with \`entity: "pattern"\`

Common patterns I look for:
- Funding trajectory
- Team composition
- Industry focus
- Go-to-market strategy`;
    }
    
    return `I understand you want to: "${query}"

I can help with:
- 🔍 **Research startups** - "Research AI coding assistants"
- 📊 **Query database** - "Show all startups in AI"
- 🧠 **Analyze patterns** - "What patterns do successful startups share?"
- 💰 **Funding data** - "Find recent Series A rounds"

What would you like me to do?`;
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
            className={`tab ${activeTab === "startups" ? "active" : ""}`}
            onClick={() => setActiveTab("startups")}
          >
            🚀 Startups ({startups.length})
          </button>
        </div>
      </div>

      {activeTab === "chat" && (
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.content.split("\n").map((line, i) => (
                  <span key={i}>
                    {line.startsWith("```") ? (
                      <pre>{line.replace(/```\w*/g, "")}</pre>
                    ) : (
                      <>
                        {line}
                        <br />
                      </>
                    )}
                  </span>
                ))}
              </div>
            ))}
            {sending && (
              <div className="message assistant">
                <em>Thinking...</em>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form className="chat-input" onSubmit={sendMessage}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to research startups..."
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

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
                Ask the agent to research some startups in the Chat tab.
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
                        style={{ fontSize: 14, color: "#4f46e5" }}
                      >
                        ↗
                      </a>
                    )}
                  </h3>
                  {startup.description && (
                    <p className="description">{startup.description}</p>
                  )}
                  <div className="tags">
                    {startup.industries?.map((ind) => (
                      <span key={ind} className="tag">
                        {ind}
                      </span>
                    ))}
                    {startup.status && (
                      <span className="tag" style={{ background: "#dbeafe", color: "#1e40af" }}>
                        {startup.status}
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
