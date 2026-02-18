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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 I'm your Startup Research Agent. Ask me about startups in the database!

Try:
• "List all startups"
• "Show me AI startups"
• "What funding rounds does Cursor have?"`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ message: userMessage }),
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

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about startups..."
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
    height: "60vh",
    minHeight: 400,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    color: "white",
    fontWeight: 600,
  },
  badge: {
    marginLeft: "auto",
    fontSize: 11,
    background: "rgba(255,255,255,0.2)",
    padding: "2px 8px",
    borderRadius: 12,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "#f9fafb",
  },
  message: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
  },
  userMessage: {
    flexDirection: "row-reverse",
  },
  avatar: {
    fontSize: 24,
    lineHeight: 1,
  },
  bubble: {
    maxWidth: "80%",
    padding: "10px 14px",
    borderRadius: 16,
    background: "#fff",
    border: "1px solid #e5e7eb",
    wordBreak: "break-word",
  },
  userBubble: {
    background: "#4f46e5",
    color: "white",
    border: "none",
  },
  thinking: {
    color: "#666",
    fontStyle: "italic",
  },
  form: {
    display: "flex",
    gap: 8,
    padding: 12,
    borderTop: "1px solid #e5e7eb",
    background: "#fff",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    fontSize: 14,
    outline: "none",
  },
  button: {
    padding: "10px 20px",
    background: "#4f46e5",
    color: "white",
    border: "none",
    borderRadius: 20,
    fontWeight: 600,
    cursor: "pointer",
  },
  // Generative UI styles
  startupsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 8,
    marginTop: 8,
  },
  startupCard: {
    padding: 12,
    background: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
  },
  tag: {
    fontSize: 11,
    padding: "2px 6px",
    background: "#e0e7ff",
    color: "#4338ca",
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
    background: "#f0fdf4",
    borderRadius: 6,
    alignItems: "center",
  },
  successCard: {
    padding: 12,
    background: "#d1fae5",
    borderRadius: 8,
    marginTop: 8,
    color: "#065f46",
  },
  emptyCard: {
    padding: 12,
    color: "#6b7280",
    fontStyle: "italic",
  },
  pendingTool: {
    padding: 8,
    color: "#6b7280",
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
    background: "#f3f4f6",
    borderRadius: 6,
    marginTop: 8,
    fontSize: 13,
    fontFamily: "monospace",
  },
};

export default Chat;
