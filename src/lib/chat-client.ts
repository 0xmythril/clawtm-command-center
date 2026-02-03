"use client";

// Types for chat messages
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Send a chat message via the gateway API
export async function sendChatMessage(
  sessionKey: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "chat.send",
        params: {
          sessionKey,
          message,
          idempotencyKey: generateId(),
        },
      }),
    });
    
    const data = await res.json();
    return { ok: data.ok, error: data.error };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Get chat history
export async function getChatHistory(
  sessionKey: string,
  limit = 50
): Promise<{ messages: ChatMessage[]; error?: string }> {
  try {
    const res = await fetch("/api/gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "chat.history",
        params: {
          sessionKey,
          limit,
        },
      }),
    });
    
    const data = await res.json();
    
    if (!data.ok) {
      return { messages: [], error: data.error };
    }
    
    // Transform gateway messages to our format
    const messages: ChatMessage[] = (data.data?.messages || [])
      .filter((m: { message?: { role?: string } }) => 
        m.message?.role === "user" || m.message?.role === "assistant"
      )
      .map((m: { id: string; timestamp?: string; message: { role: string; content?: unknown[] } }) => ({
        id: m.id,
        role: m.message.role as "user" | "assistant",
        content: extractTextContent(m.message.content),
        timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
      }));
    
    return { messages };
  } catch (error) {
    return { messages: [], error: String(error) };
  }
}

// Extract text content from message content array
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  
  return content
    .filter((c): c is { type: string; text: string } => 
      typeof c === "object" && c !== null && c.type === "text"
    )
    .map((c) => c.text)
    .join("\n");
}

// Generate a simple unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
