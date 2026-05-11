"use client";

import {
  ArrowLeft,
  BarChart2,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FileType,
  Layers,
  Link,
  Loader2,
  Map,
  MessageSquare,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Presentation,
  Trash2,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HistoryClient } from "@/app/history/history-client";
import { KnowledgeClient } from "@/app/knowledge/knowledge-client";
import { ChatPanel } from "@/components/chat-panel";
import { FocusTimer } from "@/components/focus-timer";
import { MasteryRing } from "@/components/mastery-ring";
import { Scratchpad } from "@/components/scratchpad";
import { ShareModal } from "@/components/share-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ConnectClient } from "./connect/connect-client";
import { FlashcardsClient } from "./flashcards/flashcards-client";
import { MindMapClient } from "./mindmap/mindmap-client";
import { QuizClient } from "./quiz/quiz-client";
import { SummaryClient } from "./summary/summary-client";

interface Notebook {
  id: string;
  title: string;
  subject: string | null;
  color: string;
  exam_date: string | null;
  scratchpad?: string;
  mastery_score?: number;
}

interface Source {
  id: string;
  title: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  pptx: Presentation,
  markdown: FileText,
};

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; color: string; label: string }
> = {
  pending: { icon: Clock, color: "text-[#f59e0b]", label: "Pending" },
  processing: { icon: Loader2, color: "text-[#3b82f6]", label: "Processing" },
  ready: { icon: CheckCircle2, color: "text-[#22c55e]", label: "Ready" },
  failed: { icon: XCircle, color: "text-[#ef4444]", label: "Failed" },
};

/* Studio tools */
/* Studio tools */
interface StudioTool {
  icon: any;
  label: string;
  route: string;
  desc: string;
  color: string;
  external?: boolean;
  appendNotebookId?: boolean;
}

const STUDIO_TOOLS: StudioTool[] = [
  {
    icon: MessageSquare,
    label: "Chat",
    route: "chat",
    desc: "Notebook assistant",
    color: "text-foreground",
  },
  {
    icon: Map,
    label: "Mind Map",
    route: "mindmap",
    desc: "Visual concept graph",
    color: "text-green-500",
  },
  {
    icon: Layers,
    label: "Flashcards",
    route: "flashcards",
    desc: "Spaced repetition",
    color: "text-blue-500",
  },
  {
    icon: Brain,
    label: "Quiz",
    route: "quiz",
    desc: "Test your knowledge",
    color: "text-violet-500",
  },
  {
    icon: BarChart2,
    label: "Knowledge",
    route: "knowledge",
    desc: "Mastery tracking",
    color: "text-cyan-500",
  },
  {
    icon: Clock,
    label: "History",
    route: "history",
    desc: "Study sessions",
    color: "text-amber-500",
  },
  {
    icon: Zap,
    label: "Summary",
    route: "summary",
    desc: "Quick overview",
    color: "text-red-500",
  },
  {
    icon: Link,
    label: "Connect",
    route: "connect",
    desc: "Browser extension",
    color: "text-rose-500",
  },
];

export function NotebookClient({
  notebook,
  userId,
}: {
  notebook: Notebook;
  userId: string;
}) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<"google" | "groq">(
    "google",
  );
  const [masteryScore, setMasteryScore] = useState(notebook.mastery_score || 0);
  const [examDate, setExamDate] = useState(notebook.exam_date || "");
  const [activeView, setActiveView] = useState<string>("chat");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [hasSourcesReady, setHasSourcesReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false); // Collapsed by default to show off the new design

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setLeftOpen(false);
    }
  }, []);
  const [isInterrogating, setIsInterrogating] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [scratchpadContent, setScratchpadContent] = useState(
    notebook.scratchpad || "",
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const loadSources = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .eq("notebook_id", notebook.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSources(data || []);
    } catch {
      toast.error("Failed to load sources");
    } finally {
      setIsLoading(false);
    }
  }, [notebook.id]);

  useEffect(() => {
    loadSources();
    const channel = supabase
      .channel(`sources:${notebook.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sources",
          filter: `notebook_id=eq.${notebook.id}`,
        },
        (payload) => {
          setSources((prev) =>
            prev.map((s) =>
              s.id === payload.new.id ? { ...s, ...payload.new } : s,
            ),
          );
        },
      )
      .subscribe();

    // Listen for notebook updates (like mastery_score)
    const nbChannel = supabase
      .channel(`notebook:${notebook.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notebooks",
          filter: `id=eq.${notebook.id}`,
        },
        (payload) => {
          if (payload.new.mastery_score !== undefined) {
            setMasteryScore(payload.new.mastery_score);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(nbChannel);
    };
  }, [notebook.id, loadSources]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/markdown",
    ];
    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Unsupported: ${file.name}`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`Too large (max 50MB): ${file.name}`);
        continue;
      }
      try {
        // Get the current Supabase session token to authenticate with the backend
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebook.id}/sources/upload`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: formData,
          },
        );

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: "Upload failed" }));
          throw new Error(err.detail || "Upload failed");
        }

        const data = await res.json();
        setSources((prev) => [data, ...prev]);
        toast.success(`Uploaded: ${file.name}`);
        setLeftOpen(true); // Auto-open sources on upload
      } catch (err: any) {
        toast.error(`Failed to upload: ${file.name} — ${err.message}`);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(sourceId: string, filePath: string | null) {
    try {
      if (filePath) await supabase.storage.from("sources").remove([filePath]);
      await supabase.from("sources").delete().eq("id", sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      toast.success("Source deleted");
    } catch {
      toast.error("Failed to delete source");
    }
  }

  async function handleUpdateExamDate(dateStr: string) {
    setExamDate(dateStr);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebook.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ exam_date: dateStr || null }),
        },
      );
      if (dateStr) {
        toast.success("Exam date saved. Cram mode schedule updated!");
      } else {
        toast.success("Exam date cleared.");
      }
    } catch (err) {
      toast.error("Failed to update exam date");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleUpload(e.dataTransfer.files);
  }

  const hasReady = sources.some((s) => s.status === "ready");

  return (
    <div className="h-screen flex flex-col bg-background p-3 gap-3 overflow-hidden">
      {/* -- Floating Top Header ------------------------------------------ */}
      <header className="h-12 flex items-center justify-between px-1 sm:px-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 shrink-0 rounded-full bg-card shadow-sm border border-border hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3 ml-0 sm:ml-1 min-w-0">
            <div className="bg-card rounded-full p-1 shadow-sm border border-border shrink-0">
              <MasteryRing score={masteryScore} size={28} strokeWidth={3} />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] sm:text-[17px] font-semibold text-foreground leading-none tracking-tight truncate max-w-[120px] sm:max-w-none">
                  {notebook.title}
                </h1>
              </div>
              {notebook.subject && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {notebook.subject}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsShareModalOpen(true)}
            className="h-8 rounded-full gap-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-all ml-1"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] font-semibold tracking-wide uppercase">
              Share
            </span>
          </Button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="hidden sm:flex items-center bg-card rounded-full border border-border px-3 h-9 shadow-sm hover:border-[#bdc1c6] transition-colors relative overflow-hidden">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground mr-2 shrink-0 pointer-events-none" />
            <input
              type="date"
              value={examDate}
              onChange={(e) => handleUpdateExamDate(e.target.value)}
              className="bg-transparent text-[12px] text-foreground font-semibold tracking-wide outline-none cursor-pointer flex-1 appearance-none min-w-[110px]"
              style={{ colorScheme: "var(--theme-mode, light)" }}
            />
          </div>

          {/* Active Learning Focus Timer */}
          <div className="hidden sm:block">
            <FocusTimer />
          </div>

          <div className="w-px h-6 bg-[#e8eaed] mx-1 hidden sm:block"></div>
          {!leftOpen && (
            <button
              onClick={() => {
                setLeftOpen(true);
                if (typeof window !== "undefined" && window.innerWidth < 768)
                  setRightOpen(false);
              }}
              className="h-9 px-2 sm:px-3 bg-card shadow-sm border border-border rounded-full text-xs font-medium text-[#444746] hover:bg-muted transition-colors flex items-center gap-2"
            >
              <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
              <span className="hidden sm:inline">Sources</span>
            </button>
          )}
          {!rightOpen && (
            <button
              onClick={() => {
                setRightOpen(true);
                if (typeof window !== "undefined" && window.innerWidth < 768)
                  setLeftOpen(false);
              }}
              className="h-9 px-2 sm:px-3 bg-card shadow-sm border border-border rounded-full text-xs font-medium text-[#444746] hover:bg-muted transition-colors flex items-center gap-2"
            >
              <span className="hidden sm:inline">Studio</span>
              <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {/* -- Main Workspace Area --------------------------------─ */}
      <div className="flex-1 flex gap-3 overflow-hidden relative">
        {/* Mobile Scrim */}
        {(leftOpen || rightOpen) && (
          <div
            className="md:hidden absolute inset-0 z-10 bg-foreground/10 backdrop-blur-sm rounded-[24px] transition-all"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        )}

        {/* -- LEFT: Sources Sidebar ------------------------------------ */}
        <aside
          className={`bg-card rounded-[24px] border border-border flex flex-col overflow-hidden transition-all duration-300 ease-in-out shrink-0 
          ${leftOpen ? "absolute md:relative z-20 h-full w-[85%] max-w-[320px] sm:w-72 shadow-2xl md:shadow-sm left-0 top-0" : "hidden md:flex w-16 items-center"}`}
        >
          {leftOpen ? (
            <>
              {/* Open State */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Sources
                </p>
                <button
                  onClick={() => setLeftOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              <div className="px-4 py-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-full border border-border text-[13px] font-medium text-[#444746] hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add sources
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-2 pt-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sources.length === 0 ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`mx-2 my-2 flex flex-col items-center justify-center gap-3 py-10 rounded-[24px] border-2 border-dashed cursor-pointer transition-colors ${
                      isDragOver
                        ? "border-[#1a73e8] bg-[#e8f0fe]"
                        : "border-border hover:border-[#bdc1c6]"
                    }`}
                  >
                    <FileText className="w-6 h-6 text-muted-foreground stroke-[1.5]" />
                    <div className="text-center space-y-1">
                      <p className="text-[14px] text-[#444746] font-medium">
                        Saved sources will appear here
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        PDF, DOCX, PPTX, TXT, MD
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    className="space-y-1 px-2"
                  >
                    {sources.map((source) => {
                      const TypeIcon = TYPE_ICONS[source.type] || FileText;
                      const statusCfg =
                        STATUS_CONFIG[source.status] || STATUS_CONFIG.pending;
                      const StatusIcon = statusCfg.icon;
                      return (
                        <div
                          key={source.id}
                          className="group flex items-center gap-3 px-3 py-2.5 rounded-[16px] hover:bg-muted transition-colors border border-transparent hover:border-border"
                        >
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <TypeIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate">
                              {source.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusIcon
                                className={`w-3 h-3 ${statusCfg.color} ${source.status === "processing" ? "animate-spin" : ""}`}
                              />
                              <span
                                className={`text-[10px] font-medium ${statusCfg.color}`}
                              >
                                {statusCfg.label}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handleDelete(
                                source.id,
                                (source.metadata?.file_path as string) || null,
                              )
                            }
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-[#e8eaed] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Collapsed State */
            <div className="py-4 flex flex-col items-center w-full h-full">
              <button
                onClick={() => setLeftOpen(true)}
                className="p-2 mb-4 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                title="Open Sources"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center mb-6 shadow-md hover:bg-primary/90 transition-colors"
                title="Add Source"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>

              <div className="flex flex-col gap-3 w-full px-3 overflow-y-auto no-scrollbar items-center">
                {sources.map((source) => {
                  const TypeIcon = TYPE_ICONS[source.type] || FileText;
                  return (
                    <div
                      key={source.id}
                      className="w-10 h-10 rounded-[12px] bg-muted border border-border flex items-center justify-center shrink-0"
                      title={source.title}
                    >
                      <TypeIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <div
          className={`flex-1 rounded-[24px] border shadow-sm flex flex-col overflow-hidden transition-colors duration-500 ${isInterrogating ? "bg-[#fffafa] border-[#fca5a5]" : "bg-card border-border"}`}
        >
          <div
            className={`h-14 flex items-center justify-between px-3 sm:px-6 border-b shrink-0 transition-colors duration-500 ${isInterrogating ? "border-[#fecaca] bg-[#fff0f0]" : "border-border bg-card"}`}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <p
                className={`text-[13px] sm:text-[14px] font-semibold ${isInterrogating ? "text-[#ef4444]" : "text-foreground"}`}
              >
                {isInterrogating ? "Interrogation" : "Chat"}
              </p>

              {/* Custom Toggle Switch */}
              <button
                onClick={() => setIsInterrogating(!isInterrogating)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${
                  isInterrogating ? "bg-[#ef4444]" : "bg-border"
                }`}
                aria-pressed={isInterrogating}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow-sm ring-0 transition duration-300 ease-in-out ${
                    isInterrogating ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Decorative dots to match NotebookLM look */}
              <div className="hidden sm:flex gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isInterrogating ? "bg-[#fca5a5] animate-pulse" : "bg-border"}`}
                ></div>
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isInterrogating ? "bg-[#fca5a5] animate-pulse delay-75" : "bg-border"}`}
                ></div>
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isInterrogating ? "bg-[#fca5a5] animate-pulse delay-150" : "bg-border"}`}
                ></div>
              </div>

              <div className="hidden sm:block">
                <ThemeToggle />
              </div>

              {/* Integrated Model Selector */}
              <div className="flex bg-secondary border border-border rounded-full p-0.5 shadow-sm">
                <button
                  onClick={() => setSelectedProvider("google")}
                  className={`text-[11px] px-3 py-1 rounded-full font-medium transition-all duration-300 ${
                    selectedProvider === "google"
                      ? "bg-card text-[#1a73e8] shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5"
                  }`}
                >
                  Gemini Flash
                </button>
                <button
                  onClick={() => setSelectedProvider("groq")}
                  className={`text-[11px] px-3 py-1 rounded-full font-medium transition-all duration-300 ${
                    selectedProvider === "groq"
                      ? "bg-card text-[#1a73e8] shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5"
                  }`}
                >
                  Llama 3
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {activeView === "chat" && (
              <ChatPanel
                notebookId={notebook.id}
                hasSourcesReady={hasReady}
                notebookTitle={notebook.title}
                isInterrogating={isInterrogating}
                selectedProvider={selectedProvider}
              />
            )}
            {activeView === "mindmap" && (
              <MindMapClient notebookId={notebook.id} isEmbedded />
            )}
            {activeView === "flashcards" && (
              <FlashcardsClient
                notebookId={notebook.id}
                userId={userId}
                isEmbedded
                examDate={examDate}
              />
            )}
            {activeView === "quiz" && (
              <QuizClient
                notebookId={notebook.id}
                userId={userId}
                isEmbedded
                examDate={examDate}
              />
            )}
            {activeView === "summary" && (
              <SummaryClient notebookId={notebook.id} isEmbedded />
            )}
            {activeView === "knowledge" && (
              <KnowledgeClient
                userId={userId}
                notebookId={notebook.id}
                isEmbedded
              />
            )}
            {activeView === "history" && (
              <HistoryClient userId={userId} isEmbedded />
            )}
            {activeView === "connect" && (
              <ConnectClient notebookId={notebook.id} isEmbedded />
            )}
          </div>
        </div>

        {/* -- RIGHT: Studio Sidebar ------------------------------------ */}
        <aside
          className={`bg-card rounded-[24px] border border-border flex flex-col overflow-hidden transition-all duration-300 ease-in-out shrink-0 
          ${rightOpen ? "absolute md:relative z-20 h-full w-[85%] max-w-[320px] sm:w-72 shadow-2xl md:shadow-sm right-0 top-0" : "hidden md:flex w-16 items-center"}`}
        >
          {rightOpen ? (
            <>
              {/* Open State */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Studio Tools
                </p>
                <button
                  onClick={() => setRightOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {STUDIO_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const isDisabled = !hasReady && !tool.external;

                  return (
                    <button
                      key={tool.label}
                      disabled={isDisabled}
                      onClick={() => {
                        if (tool.external) {
                          const url = tool.appendNotebookId
                            ? `${tool.route}?notebookId=${notebook.id}`
                            : tool.route;
                          router.push(url);
                        } else {
                          setActiveView(tool.route);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-[20px] border text-left transition-all group ${
                        isDisabled
                          ? "border-transparent bg-muted opacity-50 cursor-not-allowed"
                          : "border-transparent bg-card hover:border-border hover:bg-muted hover:shadow-sm"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 group-hover:bg-card transition-colors">
                        <Icon className={`w-4 h-4 ${tool.color}`} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">
                          {tool.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {tool.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {!hasReady && sources.length > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-4 px-2 leading-relaxed">
                    Tools unlock once sources finish processing
                  </p>
                )}
                {sources.length === 0 && (
                  <div className="mt-4 flex flex-col items-center gap-2 py-8">
                    <Zap className="w-6 h-6 text-[#dadce0]" />
                    <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                      Studio output will appear here after adding sources
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-border bg-muted shrink-0">
                <button
                  onClick={() => setIsNotesOpen(!isNotesOpen)}
                  className={`w-full h-11 rounded-[20px] shadow-sm flex items-center justify-center gap-2 transition-colors ${
                    isNotesOpen
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="text-[13px] font-medium">Quick Notes</span>
                </button>
              </div>
            </>
          ) : (
            /* Collapsed State - matches the image provided perfectly */
            <div className="py-4 flex flex-col items-center w-full h-full justify-between">
              <div className="flex flex-col items-center w-full">
                <div className="flex flex-col items-center gap-1 border-b border-[#f1f3f4] pb-3 mb-3 w-full">
                  <button
                    onClick={() => setRightOpen(true)}
                    className="p-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    title="Open Studio"
                  >
                    <PanelRightOpen className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-col gap-2.5 w-full px-2 items-center">
                  {STUDIO_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isDisabled = !hasReady && !tool.external;

                    return (
                      <button
                        key={tool.label}
                        title={tool.label}
                        disabled={isDisabled}
                        onClick={() => {
                          if (tool.external) {
                            const url = tool.appendNotebookId
                              ? `${tool.route}?notebookId=${notebook.id}`
                              : tool.route;
                            router.push(url);
                          } else {
                            setActiveView(tool.route);
                          }
                        }}
                        className={`w-10 h-10 rounded-[12px] flex items-center justify-center transition-colors ${
                          activeView === tool.route
                            ? "bg-foreground text-background"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${activeView === tool.route ? "text-background" : tool.color}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Black floating button at bottom */}
              <button
                onClick={() => setIsNotesOpen(!isNotesOpen)}
                className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-colors mt-auto ${
                  isNotesOpen
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-primary hover:bg-primary/90"
                }`}
                title="Quick Notes"
              >
                <FileText className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>
          )}
        </aside>

        {/* Scratchpad Overlay */}
        <Scratchpad
          notebookId={notebook.id}
          initialContent={scratchpadContent}
          isOpen={isNotesOpen}
          onClose={() => setIsNotesOpen(false)}
          onSaveContent={setScratchpadContent}
        />

        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          notebookId={notebook.id}
        />
      </div>
    </div>
  );
}
