/**
 * 💬 Chat Component - AG-UI Protocol with Real Streaming
 * 
 * Uses ReadableStream to consume SSE events in real-time.
 * Features:
 * - Real-time token streaming (not buffered)
 * - Inline tool rendering
 * - Generative UI components
 */

import { useState, useRef, useEffect, useCallback } from "react";

// Use Function URL for streaming (bypasses API Gateway limits)
const CHAT_URL = import.meta.env.VITE_CHAT_URL || `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/chat`;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

interface Skill {
  id: string;
  name: string;
  description: string;
}

interface ChatProps {
  token?: string | null;
}

// Content can be text or tool calls - rendered inline in order
type ContentSegment = 
  | { type: "text"; text: string }
  | { type: "tool"; toolCall: ToolCall };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  segments?: ContentSegment[];
  timestamp: Date;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: "pending" | "complete" | "error";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎨 GENERATIVE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function StartupsCard({ data }: { data: any }) {
  const startups = data?.startups || [];
  if (startups.length === 0) {
    return <div style={styles.emptyCard}>No startups found</div>;
  }
  return (
    <div style={styles.startupsGrid}>
      {startups.map((startup: any, i: number) => (
        <div key={startup.id || i} style={styles.startupCard}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {startup.name}
            {startup.website && (
              <a 
                href={startup.website} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ marginLeft: 8, fontSize: 12, color: "#4f46e5" }}
              >
                ↗
              </a>
            )}
          </div>
          {startup.description && (
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
              {startup.description.slice(0, 100)}...
            </div>
          )}
          {startup.industries && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(Array.isArray(startup.industries) ? startup.industries : []).slice(0, 3).map((ind: string) => (
                <span key={ind} style={styles.tag}>{ind}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FundingCard({ data }: { data: any }) {
  const rounds = data?.funding_rounds || [];
  if (rounds.length === 0) {
    return <div style={styles.emptyCard}>No funding rounds found</div>;
  }
  return (
    <div style={styles.fundingList}>
      {rounds.map((round: any, i: number) => (
        <div key={round.id || i} style={styles.fundingRow}>
          <span style={{ fontWeight: 600 }}>{round.roundType}</span>
          <span style={{ color: "#059669" }}>
            ${(round.amountUsd / 1_000_000).toFixed(1)}M
          </span>
          <span style={{ color: "#666", fontSize: 12 }}>{round.date}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessCard({ data }: { data: any }) {
  return (
    <div style={styles.successCard}>
      ✅ {data?.message || "Success!"}
      {data?.id && <span style={{ color: "#666", marginLeft: 8 }}>(ID: {data.id})</span>}
    </div>
  );
}

function ToolCallRenderer({ toolCall }: { toolCall: ToolCall }) {
  if (toolCall.status === "pending") {
    return (
      <div style={styles.pendingTool}>
        <span style={styles.spinner}>⏳</span> 
        Calling {toolCall.name}...
      </div>
    );
  }

  try {
    const result = typeof toolCall.result === "string" 
      ? JSON.parse(toolCall.result) 
      : toolCall.result;

    // Generative UI based on tool + result
    if (toolCall.name === "db_query") {
      if (result.startups) return <StartupsCard data={result} />;
      if (result.funding_rounds) return <FundingCard data={result} />;
    }
    
    if (toolCall.name === "db_insert" && result.success) {
      return <SuccessCard data={result} />;
    }

    // Fallback: generic JSON display
    return (
      <div style={styles.genericTool}>
        <strong>{toolCall.name}</strong>
        <pre style={{ margin: "4px 0 0", fontSize: 12, overflow: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    );
  } catch {
    return (
      <div style={styles.genericTool}>
        <strong>{toolCall.name}</strong>: {String(toolCall.result)}
      </div>
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📡 AG-UI EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type AGUIEventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT";

interface AGUIEvent {
  type: AGUIEventType;
  messageId?: string;
  delta?: string;
  toolCallId?: string;
  toolCallName?: string;
  argsChunk?: string;
  content?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function Chat({ token }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkillIds, setActiveSkillIds] = useState<Set<string>>(new Set());
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch skills
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/skills`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setSkills(d.skills || []))
      .catch(() => {});
  }, [token]);

  // Close plus menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleSkill = (id: string) => {
    setActiveSkillIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const activeSkillIdsRef = useRef(activeSkillIds);
  activeSkillIdsRef.current = activeSkillIds;

  const sendMessage = useCallback(async (userMessage: string) => {
    setLoading(true);

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Create placeholder for assistant
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      segments: [],
      timestamp: new Date(),
    }]);

    // State for parsing
    let segments: ContentSegment[] = [];
    let currentTextBuffer = "";
    let toolArgsBuffer: Record<string, string> = {};
    let toolIndexMap: Record<string, number> = {};

    const updateMessage = () => {
      const finalSegments = [...segments];
      if (currentTextBuffer) {
        const lastSeg = finalSegments[finalSegments.length - 1];
        if (lastSeg?.type === "text") {
          finalSegments[finalSegments.length - 1] = { type: "text", text: currentTextBuffer };
        } else {
          finalSegments.push({ type: "text", text: currentTextBuffer });
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, segments: finalSegments, content: currentTextBuffer } : m
      ));
    };

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: userMessage,
          skillIds: Array.from(activeSkillIdsRef.current),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Use ReadableStream for real-time streaming
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const event: AGUIEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case "TEXT_MESSAGE_CONTENT":
                if (event.delta) {
                  currentTextBuffer += event.delta;
                  updateMessage();
                }
                break;

              case "TOOL_CALL_START":
                if (event.toolCallId && event.toolCallName) {
                  // Flush text buffer as segment
                  if (currentTextBuffer) {
                    segments.push({ type: "text", text: currentTextBuffer });
                    currentTextBuffer = "";
                  }
                  const toolCall: ToolCall = {
                    id: event.toolCallId,
                    name: event.toolCallName,
                    args: {},
                    status: "pending",
                  };
                  toolIndexMap[event.toolCallId] = segments.length;
                  segments.push({ type: "tool", toolCall });
                  toolArgsBuffer[event.toolCallId] = "";
                  updateMessage();
                }
                break;

              case "TOOL_CALL_ARGS":
                if (event.toolCallId && event.argsChunk) {
                  toolArgsBuffer[event.toolCallId] =
                    (toolArgsBuffer[event.toolCallId] || "") + event.argsChunk;
                }
                break;

              case "TOOL_CALL_END":
                if (event.toolCallId) {
                  const segIdx = toolIndexMap[event.toolCallId];
                  if (segIdx !== undefined && segments[segIdx]?.type === "tool") {
                    const toolSeg = segments[segIdx] as { type: "tool"; toolCall: ToolCall };
                    try {
                      toolSeg.toolCall.args = JSON.parse(toolArgsBuffer[event.toolCallId] || "{}");
                    } catch {}
                    updateMessage();
                  }
                }
                break;

              case "TOOL_CALL_RESULT":
                if (event.toolCallId) {
                  const segIdx = toolIndexMap[event.toolCallId];
                  if (segIdx !== undefined && segments[segIdx]?.type === "tool") {
                    const toolSeg = segments[segIdx] as { type: "tool"; toolCall: ToolCall };
                    toolSeg.toolCall.result = event.content;
                    toolSeg.toolCall.status = "complete";
                    updateMessage();
                  }
                }
                break;

              case "RUN_ERROR":
                throw new Error(event.error || "Unknown error");
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unknown error") {
              console.warn("Failed to parse AG-UI event:", line, e);
            }
          }
        }
      }

      // Final update
      updateMessage();

      // If no content, show default
      if (!currentTextBuffer && segments.length === 0) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: "I processed your request.", segments: [] } : m
        ));
      }

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? {
          ...m,
          content: `⚠️ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        } : m
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    sendMessage(msg);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>🔍</span>
        <span>Startup Research Agent</span>
        <span style={styles.badge}>AG-UI Streaming</span>
      </div>

      <div style={styles.messages}>
        {messages.map((msg) => {
          const isEmpty = msg.role === "assistant" && !msg.content && (!msg.segments || msg.segments.length === 0);
          if (isEmpty) return null;

          return (
            <div key={msg.id} style={{
              ...styles.message,
              ...(msg.role === "user" ? styles.userMessage : {}),
            }}>
              {msg.role === "assistant" && <span style={styles.avatar}>🤖</span>}
              <div style={{
                ...styles.bubble,
                ...(msg.role === "user" ? styles.userBubble : {}),
              }}>
                {/* User messages */}
                {msg.role === "user" && (
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                )}
                {/* Assistant segments (inline tools) */}
                {msg.role === "assistant" && msg.segments?.map((seg, i) => (
                  seg.type === "text" ? (
                    <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{seg.text}</p>
                  ) : (
                    <ToolCallRenderer key={seg.toolCall.id} toolCall={seg.toolCall} />
                  )
                ))}
                {/* Fallback for no segments */}
                {msg.role === "assistant" && !msg.segments?.length && msg.content && (
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                )}
              </div>
              {msg.role === "user" && <span style={styles.avatar}>👤</span>}
            </div>
          );
        })}
        {loading && (
          <div style={styles.message}>
            <span style={styles.avatar}>🤖</span>
            <div style={styles.bubble}>
              <span style={styles.thinking}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Active skills pills */}
      {activeSkillIds.size > 0 && (
        <div style={styles.activeSkills}>
          {Array.from(activeSkillIds).map(id => {
            const skill = skills.find(s => s.id === id);
            return skill ? (
              <span key={id} style={styles.skillPill}>
                🧩 /{skill.name}
                <span onClick={() => toggleSkill(id)} style={styles.skillPillRemove}>✕</span>
              </span>
            ) : null;
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Plus button with dropdown */}
        <div ref={plusMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowPlusMenu(!showPlusMenu)}
            style={{
              ...styles.plusButton,
              background: showPlusMenu ? "#333" : "transparent",
            }}
          >
            +
          </button>
          {showPlusMenu && (
            <div style={styles.plusMenu}>
              <div style={styles.plusMenuHeader}>🧩 Skills</div>
              {skills.length === 0 ? (
                <div style={styles.plusMenuItem}>No skills yet</div>
              ) : (
                skills.map(skill => (
                  <div
                    key={skill.id}
                    onClick={() => { toggleSkill(skill.id); setShowPlusMenu(false); }}
                    style={{
                      ...styles.plusMenuItem,
                      background: activeSkillIds.has(skill.id) ? "#1e3a5f" : "transparent",
                    }}
                  >
                    <span>{activeSkillIds.has(skill.id) ? "✅" : "⬜"}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>/{skill.name}</div>
                      {skill.description && (
                        <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
                          {skill.description.slice(0, 60)}{skill.description.length > 60 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          style={styles.input}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            ...styles.button,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎨 STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: "#212121",
  },
  header: {
    display: "none",
  },
  badge: {
    display: "none",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "#212121",
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  message: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  userMessage: {
    flexDirection: "row-reverse",
  },
  avatar: {
    fontSize: 22,
    lineHeight: 1,
    marginTop: 2,
  },
  bubble: {
    maxWidth: "85%",
    padding: "12px 16px",
    borderRadius: 18,
    background: "#2a2a2a",
    border: "1px solid #333",
    wordBreak: "break-word",
    color: "#ececec",
    fontSize: 14,
    lineHeight: 1.6,
  },
  userBubble: {
    background: "#10a37f",
    color: "white",
    border: "none",
  },
  thinking: {
    color: "#777",
    fontStyle: "italic",
  },
  form: {
    display: "flex",
    gap: 10,
    padding: "12px 16px 24px",
    background: "#212121",
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  input: {
    flex: 1,
    padding: "12px 18px",
    border: "1px solid #444",
    borderRadius: 24,
    fontSize: 14,
    outline: "none",
    background: "#2a2a2a",
    color: "#ececec",
  },
  button: {
    padding: "12px 22px",
    background: "#10a37f",
    color: "white",
    border: "none",
    borderRadius: 24,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  startupsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 8,
    marginTop: 8,
  },
  startupCard: {
    padding: 12,
    background: "#333",
    borderRadius: 8,
    border: "1px solid #444",
  },
  tag: {
    fontSize: 11,
    padding: "2px 6px",
    background: "#1e3a5f",
    color: "#93c5fd",
    borderRadius: 4,
  },
  fundingList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 8,
  },
  fundingRow: {
    display: "flex",
    gap: 12,
    padding: 8,
    background: "#0d2818",
    borderRadius: 6,
    alignItems: "center",
    color: "#6ee7b7",
  },
  successCard: {
    padding: 12,
    background: "#0d2818",
    borderRadius: 8,
    marginTop: 8,
    color: "#6ee7b7",
  },
  emptyCard: {
    padding: 12,
    color: "#777",
    fontStyle: "italic",
  },
  pendingTool: {
    padding: 8,
    color: "#777",
    fontStyle: "italic",
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  spinner: {
    animation: "spin 1s linear infinite",
  },
  genericTool: {
    padding: 8,
    background: "#333",
    borderRadius: 6,
    marginTop: 8,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#b4b4b4",
  },
  activeSkills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    padding: "0 16px 4px",
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  skillPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "#1e3a5f",
    borderRadius: 12,
    fontSize: 12,
    color: "#93c5fd",
  },
  skillPillRemove: {
    cursor: "pointer",
    opacity: 0.6,
    fontSize: 10,
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "1px solid #444",
    color: "#b4b4b4",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.2s",
  },
  plusMenu: {
    position: "absolute" as const,
    bottom: 44,
    left: 0,
    minWidth: 240,
    background: "#2a2a2a",
    border: "1px solid #444",
    borderRadius: 12,
    padding: 6,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    zIndex: 100,
  },
  plusMenuHeader: {
    padding: "6px 10px",
    fontSize: 12,
    color: "#777",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  plusMenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    color: "#ececec",
    transition: "background 0.15s",
  },
};

export default Chat;
