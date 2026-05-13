"use client";

import {
  Bot,
  BrainCircuit,
  FileText,
  Loader2,
  Mic,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  TriangleAlert,
  User,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface Citation {
  source_title: string;
  page_num: number | null;
  source_id?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  isError?: boolean;
}

interface ChatPanelProps {
  notebookId: string;
  hasSourcesReady: boolean;
  notebookTitle?: string;
  isInterrogating?: boolean;
  selectedProvider?: "google" | "groq";
}

export function ChatPanel({
  notebookId,
  hasSourcesReady,
  notebookTitle,
  isInterrogating = false,
  selectedProvider = "google",
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"standard" | "feynman">("standard");
  const [isListening, setIsListening] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

// Helper to parse and render citations in text - Moved outside for performance
const renderCitations = (children: any): any => {
  if (typeof children === "string") {
    const citationRegex = /\[Source:\s*"([^"]+)"(?:,\s*Page\s*(\d+))?\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(children)) !== null) {
      if (match.index > lastIndex) {
        parts.push(children.substring(lastIndex, match.index));
      }

      const title = match[1];
      const page = match[2];

      parts.push(
        <span
          key={`inline-${title}-${match.index}`}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 mx-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary/80 cursor-default select-none align-baseline whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-primary/20 transition-colors"
          title={title}
        >
          <FileText className="w-2.5 h-2.5 opacity-70" />
          <span className="max-w-[100px] truncate">{title}</span>
          {page && (
            <>
              <span className="w-px h-2.5 bg-primary/20 mx-0.5" />
              <span className="opacity-60 font-medium">p.{page}</span>
            </>
          )}
        </span>
      );

      lastIndex = citationRegex.lastIndex;
    }

    if (lastIndex < children.length) {
      parts.push(children.substring(lastIndex));
    }

    return parts.length > 0 ? parts : children;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <React.Fragment key={i}>{renderCitations(child)}</React.Fragment>
    ));
  }

  return children;
};

// Memoized individual message component
const ChatMessage = React.memo(({ msg, chatMode, renderCitations }: { msg: Message, chatMode: string, renderCitations: any }) => {
  const markdownComponents = React.useMemo(() => ({
    p: ({ children }: any) => (
      <p className="mb-2 last:mb-0">{renderCitations(children)}</p>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">
        {children}
      </h3>
    ),
    ul: ({ children }: any) => (
      <ul className="mb-2 ml-3 space-y-0.5 list-none">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="mb-2 ml-4 space-y-0.5 list-decimal">
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className="flex gap-1.5 mb-1 last:mb-0">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
        <span>{renderCitations(children)}</span>
      </li>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }: any) => (
      <em className="italic">{children}</em>
    ),
    code: ({ children, className }: any) => {
      const isBlock = className?.includes("language-");
      return isBlock ? (
        <code className="block bg-secondary border border-border rounded-lg px-3 py-2 text-[12px] font-mono my-2 overflow-x-auto whitespace-pre">
          {children}
        </code>
      ) : (
        <code className="bg-secondary border border-border rounded px-1.5 py-0.5 text-[12px] font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }: any) => (
      <pre className="my-2">{children}</pre>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-primary pl-3 my-2 text-muted-foreground italic">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-border my-3" />,
  }), [renderCitations]);

  return (
    <div
      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
    >
      {msg.role === "assistant" && !msg.isError && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
      )}
      {msg.role === "assistant" && msg.isError && (
        <div className="w-7 h-7 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
          <TriangleAlert className="w-3.5 h-3.5 text-destructive" />
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
          msg.role === "user"
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : msg.isError
              ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm shadow-sm"
              : "bg-muted text-foreground rounded-bl-sm border border-border"
        }`}
      >
        <div className="text-sm leading-relaxed">
          {msg.isError ? (
            <span>{msg.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {msg.content}
            </ReactMarkdown>
          )}
          {msg.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 rounded-sm align-middle" />
          )}
        </div>

        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-1.5">
            {msg.citations.map((c, i) => (
              <span
                key={`${c.source_title}-${i}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary/80 cursor-default select-none shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-primary/20 transition-colors"
              >
                <FileText className="w-2.5 h-2.5 opacity-70" />
                <span className="truncate max-w-[120px]">{c.source_title}</span>
                {c.page_num && (
                  <>
                    <span className="w-px h-2.5 bg-primary/20 mx-0.5" />
                    <span className="opacity-60 font-medium">p.{c.page_num}</span>
                  </>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      {msg.role === "user" && (
        <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
});
ChatMessage.displayName = "ChatMessage";

  // Connect WebSocket
  const connect = useCallback(async () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiHost =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ||
      "127.0.0.1:8000";

    // Get auth token — WebSockets can't send custom headers, so pass as query param
    const supabaseClient = createClient();
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const token = session?.access_token ?? "";

    const wsUrl = `${protocol}//${apiHost}/ws/chat${token ? `?token=${token}` : ""}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "status":
            setStatusText(data.content);
            break;

          case "token":
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + data.content },
                ];
              }
              return [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: data.content,
                  isStreaming: true,
                },
              ];
            });
            setStatusText("");
            break;

          case "done":
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, isStreaming: false, citations: data.citations },
                ];
              }
              return prev;
            });
            setIsLoading(false);
            setStatusText("");
            break;

          case "error":
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: data.content,
                isError: true,
              },
            ]);
            setIsLoading(false);
            setStatusText("");
            break;

          case "session":
            setSessionId(data.session_id);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      // Don't reconnect on auth failure (code 4001) — only on unexpected drops
      if (event.code !== 4001) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;
  }, []);

  // Load history and connect WebSocket
  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        const supabaseClient = createClient();
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session || !isMounted) return;

        // Fetch user providers to populate model switcher
        const provRes = await fetch("/api/v1/providers/user", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (provRes.ok) {
          const provData = await provRes.json();
          // Only show working providers (active + valid key)
          const active = (provData.providers || []).filter((p: any) => 
            p.is_active && p.api_key_masked && !p.api_key_masked.includes("failed")
          );
          setAvailableProviders(active);
          // Set default active provider from user's default setting
          const def = active.find((p: any) => p.is_default) || active[0];
          if (def) setActiveProvider(def.provider);
        }

        const res = await fetch(`/api/v1/sessions/notebook/${notebookId}/latest`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.session) {
            setSessionId(data.session.id);
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                citations: m.citations || [],
              })));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    }

    if (hasSourcesReady) {
      loadHistory();
      connect();
    }

    return () => {
      isMounted = false;
      wsRef.current?.close();
    };
  }, [notebookId, hasSourcesReady, connect]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setInput(
            (prev) =>
              prev +
              (prev.endsWith(" ") || prev === "" ? "" : " ") +
              finalTranscript,
          );
        }
      };

      recognition.onerror = (event: any) => {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        if (event.error === "not-allowed") {
          toast.error(
            "Microphone access denied. Please allow microphone permissions in your browser.",
          );
        } else {
          toast.error(`Speech recognition error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          // Explicitly ask for microphone permissions to trigger the browser prompt
          await navigator.mediaDevices.getUserMedia({ audio: true });

          recognitionRef.current.start();
          setIsListening(true);
        } catch (err) {
          toast.error(
            "Microphone permission denied. Please allow access in your browser settings.",
          );
          setIsListening(false);
        }
      } else {
        alert("Speech recognition is not supported in your browser.");
      }
    }
  };

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || !wsRef.current || isLoading) return;

    const content = input.trim();
    setInput("");

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content },
    ]);

    // Send to WebSocket (include session_id for working memory)
    wsRef.current.send(
      JSON.stringify({
        content,
        notebook_id: notebookId,
        session_id: sessionId,
        provider: activeProvider,
        mode: chatMode,
      }),
    );

    setIsLoading(true);
    inputRef.current?.focus();
  }

  // Empty state
  if (!hasSourcesReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-card">
        <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          Upload sources first
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
          Add PDFs, DOCX, or PPTX files using the Sources panel, then chat with
          your materials.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12 animate-in fade-in duration-500">
            <div
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-colors ${
                chatMode === "feynman"
                  ? "bg-[#a855f7]/10 border-[#a855f7]/20"
                  : "bg-muted border-border"
              }`}
            >
              {chatMode === "feynman" ? (
                <BrainCircuit className="w-5 h-5 text-[#a855f7]" />
              ) : (
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {chatMode === "feynman"
                  ? "Feynman Technique"
                  : (notebookTitle ?? "Ready to study")}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs px-4 leading-relaxed">
                {chatMode === "feynman"
                  ? "Explain a concept in your own words. The AI acts as a beginner and will grade your understanding."
                  : "Ask anything about your uploaded materials."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm px-2">
              {(chatMode === "feynman"
                ? [
                    "Let me explain the core concept...",
                    "The main difference between them is...",
                    "Here is how this works in practice...",
                  ]
                : [
                    "Summarize the key concepts",
                    "What are the main themes?",
                    "Explain this in simple terms",
                  ]
              ).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    chatMode === "feynman"
                      ? "border-[#a855f7]/20 text-[#c084fc] hover:bg-[#a855f7]/10 hover:border-[#a855f7]/40"
                      : "border-border text-muted-foreground hover:bg-secondary hover:border-muted-foreground/30"
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage 
            key={msg.id} 
            msg={msg} 
            chatMode={chatMode} 
            renderCitations={renderCitations} 
          />
        ))}

        {statusText && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Search className="w-3 h-3 animate-pulse" />
            {statusText}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-transparent border-t border-border/10">
        <div className="max-w-5xl mx-auto w-full flex flex-col gap-3">
          {/* Main Controls Row */}
          <div className="flex items-end gap-3 w-full">
            {/* Mode Switcher - Far Left */}
            <div className="flex flex-col gap-2 shrink-0 pb-1">
              <div className="flex items-center bg-muted/40 p-0.5 rounded-full border border-border">
                <button
                  type="button"
                  onClick={() => setChatMode("standard")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                    chatMode === "standard"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  Tutor
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode("feynman")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                    chatMode === "feynman"
                      ? "bg-purple-500/10 text-purple-600 font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BrainCircuit className="w-3.5 h-3.5" />
                  Feynman
                </button>
              </div>
            </div>

            {/* Input Area - Center (Flexible) */}
            <form
              onSubmit={handleSend}
              className={`relative flex-1 flex items-center bg-card shadow-[0_2px_12px_rgba(0,0,0,0.04)] border rounded-full p-1 transition-all duration-500 focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)] ${
                chatMode === "feynman"
                  ? "border-[#a855f7]/30 focus-within:border-[#9333ea]"
                  : isInterrogating
                    ? "border-[#fca5a5]/30 focus-within:border-[#ef4444]"
                    : "border-border/50 focus-within:border-[#2563eb]"
              }`}
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isConnected
                    ? chatMode === "feynman"
                      ? "Explain it to the tutor..."
                      : isInterrogating
                        ? "Answer the question..."
                        : "Ask anything..."
                    : "Connecting..."
                }
                disabled={!isConnected || isLoading}
                className={`flex-1 border-0 shadow-none focus-visible:ring-0 text-sm h-11 px-5 placeholder:text-muted-foreground/50 ${
                  chatMode === "feynman"
                    ? "text-[#9333ea] placeholder:text-[#d8b4fe]"
                    : isInterrogating
                      ? "text-[#ef4444] placeholder:text-[#fca5a5]"
                      : "text-foreground"
                }`}
                maxLength={5000}
              />
              
              <div className="flex items-center gap-1 pr-1.5">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isListening
                      ? "bg-red-500/10 text-red-500 animate-pulse"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary"
                  }`}
                  title={isListening ? "Stop listening" : "Start speaking"}
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
    
                <button
                  type="submit"
                  disabled={!input.trim() || !isConnected || isLoading}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 shrink-0 ${
                    !input.trim() || !isConnected || isLoading
                      ? "bg-muted text-muted-foreground/30 cursor-not-allowed"
                      : chatMode === "feynman"
                        ? "bg-[#a855f7] text-white shadow-lg shadow-purple-500/20 hover:bg-[#9333ea] hover:scale-105 active:scale-95"
                        : isInterrogating
                          ? "bg-[#ef4444] text-white shadow-lg shadow-red-500/20 hover:bg-[#dc2626] hover:scale-105 active:scale-95"
                          : "bg-[#2563eb] text-white shadow-lg shadow-blue-500/20 hover:bg-[#1d4ed8] hover:scale-105 active:scale-95"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </button>
              </div>
            </form>

            {/* Model & Status - Far Right */}
            <div className="flex flex-col gap-2 shrink-0 pb-1 items-end">
              <div className="flex items-center gap-3">
                {availableProviders.length > 1 && (
                  <div className="flex items-center bg-secondary/50 p-0.5 rounded-full border border-border/50 shadow-sm overflow-hidden">
                    {availableProviders.map((p) => (
                      <button
                        key={p.provider}
                        type="button"
                        onClick={() => setActiveProvider(p.provider)}
                        className={`px-3 py-1.5 rounded-full text-[9px] font-bold tracking-tight transition-all duration-300 ${
                          activeProvider === p.provider
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p.provider_name.replace("Google ", "").replace("Groq ", "")}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 px-2">
                  <div className={`relative flex h-1.5 w-1.5`}>
                    {isConnected && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34a853] opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isConnected ? "bg-[#34a853]" : "bg-[#ea4335]"}`}
                    ></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setSessionId(null);
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors ml-1"
                    title="Reset Chat"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
