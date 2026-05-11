"use client";

import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Lightbulb,
  Loader2,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface KeyTerm {
  term: string;
  definition: string;
}

interface SummaryData {
  notebook_title: string;
  overview: string;
  key_concepts: string[];
  key_terms: KeyTerm[];
  takeaways: string[];
}

export function SummaryClient({
  notebookId,
  isEmbedded,
}: {
  notebookId: string;
  isEmbedded?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"generate" | "view">("generate");
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<Set<number>>(new Set());

  async function handleGenerate() {
    setIsLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/summary/generate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ detail: "Generation failed" }));
        throw new Error(err.detail || "Generation failed");
      }

      const data: SummaryData = await res.json();
      setSummary(data);
      setPhase("view");
      toast.success("Summary generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate summary");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function buildMarkdown(): string {
    if (!summary) return "";
    const lines = [
      `# ${summary.notebook_title} — Study Summary\n`,
      `## Overview\n${summary.overview}\n`,
      `## Key Concepts\n${summary.key_concepts.map((c) => `- ${c}`).join("\n")}\n`,
      `## Key Terms\n${summary.key_terms.map((t) => `**${t.term}**: ${t.definition}`).join("\n\n")}\n`,
      `## Main Takeaways\n${summary.takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    ];
    return lines.join("\n");
  }

  function toggleTerm(i: number) {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const content = (
    <div
      className={`flex flex-col items-center ${isEmbedded ? "h-full w-full" : "min-h-screen bg-background"}`}
    >
      {/* Floating Header */}
      {!isEmbedded && (
        <div className="w-full max-w-3xl px-4 pt-6 pb-2 shrink-0">
          <header className="h-16 flex items-center justify-between px-6 bg-card rounded-full shadow-sm border border-border">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/notebook/${notebookId}`)}
                className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors border border-border"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-red-500" />
                </div>
                <h1 className="text-lg font-semibold text-foreground tracking-tight">
                  Summary Studio
                </h1>
              </div>
            </div>
            {phase === "view" && summary && (
              <button
                onClick={() => handleCopy(buildMarkdown(), "full")}
                className="h-9 px-4 rounded-full bg-muted border border-border text-[13px] font-medium text-foreground hover:bg-secondary flex items-center gap-2 transition-colors"
              >
                {copiedId === "full" ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId === "full" ? "Copied!" : "Copy Markdown"}
              </button>
            )}
          </header>
        </div>
      )}

      <main
        className={`flex-1 w-full max-w-3xl px-4 py-8 flex flex-col ${isEmbedded ? "overflow-y-auto" : ""}`}
      >
        {/* -- Generate Phase -- */}
        {phase === "generate" && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-card shadow-sm border border-border flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-[28px] font-bold text-foreground tracking-tight">
                Generate Summary
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                Our AI will analyze your sources and create a structured study
                brief with key concepts, terms, and takeaways.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="h-14 px-10 rounded-full bg-foreground text-background font-medium text-[15px] flex items-center gap-3 transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Analyzing
                  Sources...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-primary-foreground" />{" "}
                  Generate Summary
                </>
              )}
            </button>
          </div>
        )}

        {/* -- View Phase -- */}
        {phase === "view" && summary && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Overview */}
            <div className="bg-card rounded-[28px] border border-border p-7 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Overview
                </h2>
              </div>
              <p className="text-[16px] text-foreground leading-relaxed">
                {summary.overview}
              </p>
            </div>

            {/* Key Concepts */}
            <div className="bg-card rounded-[28px] border border-border p-7 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Key Concepts
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.key_concepts.map((concept) => (
                  <span
                    key={concept}
                    className="px-4 py-2 rounded-full bg-muted border border-border text-[13px] font-medium text-foreground"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>

            {/* Key Terms */}
            <div className="bg-card rounded-[28px] border border-border p-7 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-blue-500" />
                <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Key Terms
                </h2>
              </div>
              <div className="space-y-2">
                {summary.key_terms.map((item, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-[16px] overflow-hidden"
                  >
                    <button
                      onClick={() => toggleTerm(i)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted transition-colors"
                    >
                      <span className="text-[14px] font-semibold text-foreground">
                        {item.term}
                      </span>
                      {expandedTerms.has(i) ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {expandedTerms.has(i) && (
                      <div className="px-5 pb-4 text-[14px] text-muted-foreground leading-relaxed border-t border-border">
                        <p className="pt-3">{item.definition}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Takeaways */}
            <div className="bg-card rounded-[28px] border border-border p-7 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-green-500" />
                <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Main Takeaways
                </h2>
              </div>
              <ol className="space-y-3">
                {summary.takeaways.map((point, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="w-7 h-7 rounded-full bg-foreground text-background text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[14px] text-foreground leading-relaxed pt-0.5">
                      {point}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-4 pb-8">
              <button
                onClick={() => router.push(`/notebook/${notebookId}`)}
                className="h-12 px-6 rounded-full bg-card border border-border text-foreground font-medium flex items-center gap-2 hover:bg-muted transition-all shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Notebook
              </button>
              <button
                onClick={() => {
                  setSummary(null);
                  setPhase("generate");
                }}
                className="h-12 px-8 rounded-full bg-foreground text-background font-medium flex items-center gap-2 hover:opacity-90 hover:shadow-lg transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Regenerate
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );

  return content;
}
