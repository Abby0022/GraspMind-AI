"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Link,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Concept {
  concept: string;
  mastery: string;
  times_asked: number;
  times_correct: number;
  accuracy: number;
  last_seen: string;
}
interface KnowledgeProfile {
  total_concepts: number;
  mastery_distribution: Record<string, number>;
  concepts: Concept[];
}
interface Recommendation {
  concept: string;
  action: string;
  urgency: string;
  accuracy: number;
  times_studied: number;
}
interface RecsData {
  recommendations: Recommendation[];
  total_weak: number;
  suggestion: string;
}
interface CrossLink {
  concept: string;
  mastery: string;
  notebook_id: string | null;
  notebook_title: string;
}

const MASTERY_META: Record<string, { label: string; icon: typeof Brain }> = {
  mastered: { label: "Mastered", icon: CheckCircle2 },
  familiar: { label: "Familiar", icon: TrendingUp },
  learning: { label: "Learning", icon: BookOpen },
  struggling: { label: "Struggling", icon: AlertTriangle },
  unknown: { label: "New", icon: Brain },
};

export function KnowledgeClient({
  userId,
  notebookId,
  isEmbedded,
}: {
  userId: string;
  notebookId?: string;
  isEmbedded?: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<KnowledgeProfile | null>(null);
  const [recs, setRecs] = useState<RecsData | null>(null);
  const [crossLinks, setCrossLinks] = useState<CrossLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const [p, r, c] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/knowledge/profile`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/knowledge/recommendations`,
            {
              headers: { Authorization: `Bearer ${session.access_token}` },
            },
          ),
          notebookId
            ? fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/related-concepts`,
                {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                },
              )
            : Promise.resolve(null),
        ]);
        if (p.ok) setProfile(await p.json());
        if (r.ok) setRecs(await r.json());
        if (c && c.ok) setCrossLinks(await c.json());
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [notebookId]);

  const notebookConcepts = notebookId
    ? (profile?.concepts.filter((c: any) => c.notebook_id === notebookId) ?? [])
    : (profile?.concepts ?? []);
  const filtered = notebookConcepts.filter(
    (c) => !filter || c.mastery === filter,
  );
  const backHref = notebookId ? `/notebook/${notebookId}` : "/dashboard";
  const total = profile?.total_concepts ?? 0;
  const dist = profile?.mastery_distribution ?? {};

  return (
    <div className={`flex flex-col ${isEmbedded ? "h-full w-full overflow-hidden" : "min-h-screen bg-background"}`}>
      
      {!isEmbedded && (
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(backHref)}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <h1 className="text-[14px] font-bold text-foreground tracking-tight">
                  {notebookId ? "Knowledge — This Notebook" : "Knowledge Graph"}
                </h1>
              </div>
            </div>
            {filtered.length > 0 && (
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider bg-secondary/50 px-2.5 py-1 rounded-md border border-border/50">
                {filtered.length} Concepts
              </span>
            )}
          </div>
        </header>
      )}

      <main className={`max-w-6xl mx-auto w-full px-5 ${isEmbedded ? "flex-1 overflow-y-auto py-6" : "py-10 space-y-8"}`}>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card border border-border border-dashed rounded-3xl">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No knowledge tracked yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Take a quiz or start a chat to build your profile.</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="h-10 px-6 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Start Studying
            </button>
          </div>
        ) : (
          <>
            {/* -- Top Grid: Mastery Distribution -- */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Mastery Distribution</h3>
                </div>
              </div>

              {/* Mastery bar */}
              <div className="h-3 rounded-full bg-secondary flex overflow-hidden mb-6">
                {(["mastered", "familiar", "learning", "struggling"] as const).map((level) => {
                  const count = dist[level] ?? 0;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const shades = {
                    mastered: "bg-primary",
                    familiar: "bg-primary/70",
                    learning: "bg-primary/40",
                    struggling: "bg-primary/20",
                  };
                  return pct > 0 ? (
                    <div key={level} className={`${shades[level]} transition-all`} style={{ width: `${pct}%` }} />
                  ) : null;
                })}
              </div>

              {/* Metric Blocks */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(["mastered", "familiar", "learning", "struggling", "unknown"] as const).map((level) => {
                  const meta = MASTERY_META[level];
                  const Icon = meta.icon;
                  const count = dist[level] ?? 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  const isActive = filter === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setFilter(isActive ? null : level)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
                        isActive
                          ? "border-primary bg-primary/5 shadow-inner"
                          : "border-border bg-secondary/30 hover:bg-secondary/70 hover:border-primary/30"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-2 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <p className={`text-2xl font-bold leading-none mb-1 ${isActive ? "text-primary" : "text-foreground"}`}>
                        {count}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        {meta.label} · {pct}%
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* -- Mid Section: Insights & Recommendations -- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* Recommendations */}
              {recs && recs.recommendations.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
                  </div>
                  <p className="text-[12px] text-muted-foreground mb-4">
                    {recs.suggestion}
                  </p>
                  <div className="space-y-2">
                    {recs.recommendations.map((r) => (
                      <div key={r.concept} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${r.urgency === "high" ? "bg-destructive" : r.urgency === "medium" ? "bg-amber-500" : "bg-primary/40"}`} />
                          <span className="text-[13px] font-medium text-foreground capitalize">{r.concept}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{r.action}</span>
                          <span className="text-[10px] font-bold text-foreground bg-background px-2 py-1 rounded-md border border-border/50">{r.accuracy}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cross-Notebook Links */}
              {notebookId && crossLinks.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-5">
                    <Link className="w-24 h-24 text-primary/5 -mr-8 -mt-8" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Link className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Cross-Notebook Insights</h3>
                  </div>
                  <p className="text-[12px] text-muted-foreground mb-4 relative z-10">
                    We found these related concepts in your other notebooks.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                    {crossLinks.map((link) => (
                      <button
                        key={`${link.notebook_id}-${link.concept}`}
                        onClick={() => link.notebook_id && router.push(`/notebook/${link.notebook_id}`)}
                        className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50 hover:bg-secondary/70 hover:border-primary/30 transition-all text-left group"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold capitalize text-foreground truncate">{link.concept}</p>
                          <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">From: {link.notebook_title}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* -- Concepts Grid -- */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-foreground tracking-tight">
                  {filter ? `${MASTERY_META[filter]?.label} Concepts` : "All Concepts"}
                </h3>
                {filter && (
                  <button
                    onClick={() => setFilter(null)}
                    className="text-[12px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((c) => {
                  const meta = MASTERY_META[c.mastery] ?? MASTERY_META.unknown;
                  const Icon = meta.icon;
                  return (
                    <div key={c.concept} className="flex flex-col p-5 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md border border-border/50">
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-auto">
                        <h4 className="text-base font-bold text-foreground capitalize mb-2">{c.concept}</h4>
                        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1">
                          <span>Accuracy</span>
                          <span className="text-foreground">{c.accuracy}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${c.accuracy}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {c.times_correct} of {c.times_asked} correct
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-16 bg-card border border-border border-dashed rounded-3xl mt-4">
                  <p className="text-sm font-semibold text-muted-foreground">No concepts found for this filter.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
