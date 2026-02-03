"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendChatMessage, getChatHistory, type ChatMessage } from "@/lib/chat-client";

const SESSION_KEY = "agent:main:main";

interface ChatOverlayProps {
  className?: string;
}

export function ChatOverlay({ className }: ChatOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getChatHistory(SESSION_KEY, 30);
      if (result.error) {
        setError(result.error);
      } else {
        setMessages(result.messages);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      loadHistory();
    }
  }, [isOpen, messages.length, loadHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const result = await sendChatMessage(SESSION_KEY, userMessage.content);
      
      if (!result.ok) {
        setError(result.error || "Failed to send message");
      } else {
        // Add a placeholder for assistant response
        // In a real implementation, you'd use WebSocket for streaming
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Processing your request... (Refresh to see response)",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg transition-all z-50",
          "bg-orange-500 hover:bg-orange-600 text-white",
          "flex items-center justify-center btn-press",
          isOpen && "scale-0 opacity-0",
          className
        )}
      >
        <span className="text-2xl">🦞</span>
      </button>

      {/* Chat Overlay */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[70vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-xl">🦞</span>
              <div>
                <h3 className="font-semibold">ClawdTM</h3>
                <p className="text-xs text-zinc-400">Chat with your agent</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadHistory}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className={cn("w-5 h-5 text-zinc-400", loading && "animate-spin")} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[50vh]">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-sm">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No messages yet</p>
                <p className="text-xs mt-1">Say hello to your agent!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-br-md"
                        : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                  <span className="text-xs text-zinc-500 mt-1 px-1">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={sending}
                className={cn(
                  "flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3",
                  "text-sm text-zinc-100 placeholder-zinc-500",
                  "focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500",
                  "disabled:opacity-50"
                )}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className={cn(
                  "p-3 rounded-xl transition-colors",
                  "bg-orange-500 hover:bg-orange-600 text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
