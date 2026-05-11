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
import { useCallback, useEffect, useRef, useState } from "react";
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
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  // Connect WebSocket
  const connect = useCallback(async () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiHost =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ||
      "localhost:8000";

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

  useEffect(() => {
    if (hasSourcesReady) {
      connect();
    }
    return () => {
      wsRef.current?.close();
    };
  }, [hasSourcesReady, connect]);

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
        provider: selectedProvider,
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
          <div
            key={msg.id}
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
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-sm font-bold mt-3 mb-1.5 first:mt-0">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-2 ml-3 space-y-0.5 list-none">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-2 ml-4 space-y-0.5 list-decimal">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="flex gap-1.5">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span>{children}</span>
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-foreground">
                          {children}
                        </strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      code: ({ children, className }) => {
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
                      pre: ({ children }) => (
                        <pre className="my-2">{children}</pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-primary pl-3 my-2 text-muted-foreground italic">
                          {children}
                        </blockquote>
                      ),
                      hr: () => <hr className="border-border my-3" />,
                    }}
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
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-card border border-border rounded-md px-1.5 py-0.5"
                    >
                      <FileText className="w-2.5 h-2.5" />
                      {c.source_title}
                      {c.page_num && ` p.${c.page_num}`}
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
        ))}

        {statusText && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Search className="w-3 h-3 animate-pulse" />
            {statusText}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className={`p-4 transition-colors duration-500 bg-transparent`}>
        <div className="max-w-4xl mx-auto w-full">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between mb-2.5 px-1">
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

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className={`relative flex h-1.5 w-1.5`}>
                  {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34a853] opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isConnected ? "bg-[#34a853]" : "bg-[#ea4335]"}`}
                  ></span>
                </div>
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {isConnected ? "Connected" : "Connecting"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setSessionId(null);
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                title="Reset Chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Input Area */}
          <form
            onSubmit={handleSend}
            className={`relative flex items-center bg-card shadow-[0_2px_12px_rgba(0,0,0,0.04)] border rounded-[24px] p-1.5 transition-all duration-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${
              chatMode === "feynman"
                ? "border-[#a855f7] focus-within:border-[#9333ea]"
                : isInterrogating
                  ? "border-[#fca5a5] focus-within:border-[#ef4444]"
                  : "border-border focus-within:border-[#1a73e8]"
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
              className={`flex-1 border-0 shadow-none focus-visible:ring-0 text-sm h-12 px-4 placeholder:text-muted-foreground ${
                chatMode === "feynman"
                  ? "text-[#9333ea] placeholder:text-[#d8b4fe]"
                  : isInterrogating
                    ? "text-[#ef4444] placeholder:text-[#fca5a5]"
                    : "text-foreground"
              }`}
              maxLength={5000}
            />
            <div className="absolute right-[88px] text-[10px] text-muted-foreground/40 font-medium select-none pointer-events-none">
              {input.length}/5000
            </div>

            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-12 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                isListening
                  ? "bg-red-500/10 text-red-500 animate-pulse"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              title={isListening ? "Stop listening" : "Start speaking"}
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="submit"
              disabled={!input.trim() || !isConnected || isLoading}
              className={`w-10 h-10 rounded-[18px] flex items-center justify-center transition-all duration-300 shrink-0 ${
                !input.trim() || !isConnected || isLoading
                  ? "bg-muted text-[#dadce0] cursor-not-allowed"
                  : chatMode === "feynman"
                    ? "bg-[#a855f7] text-white shadow-[0_2px_8px_rgba(168,85,247,0.3)] hover:bg-[#9333ea] hover:shadow-[0_4px_12px_rgba(168,85,247,0.4)] hover:-translate-y-0.5"
                    : isInterrogating
                      ? "bg-[#ef4444] text-white shadow-[0_2px_8px_rgba(239,68,68,0.3)] hover:bg-[#dc2626] hover:shadow-[0_4px_12px_rgba(239,68,68,0.4)] hover:-translate-y-0.5"
                      : "bg-[#1a73e8] text-white shadow-[0_2px_8px_rgba(26,115,232,0.3)] hover:bg-[#1557b0] hover:shadow-[0_4px_12px_rgba(26,115,232,0.4)] hover:-translate-y-0.5"
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
