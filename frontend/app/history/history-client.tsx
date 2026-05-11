"use client";

import {
  ArrowLeft,
  BookOpen,
  Clock,
  Flame,
  Hash,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Episode {
  id: string;
  session_id: string;
  notebook_id: string;
  summary: string;
  topics: string[];
  message_count: number;
  created_at: string;
  notebooks?: { title: string; subject: string; color: string };
}
interface StudyStats {
  total_sessions: number;
  total_messages: number;
  top_topics: { topic: string; count: number }[];
  study_streak: number;
  recent_activity: number;
}

export function HistoryClient({
  userId,
  isEmbedded,
}: {
  userId: string;
  isEmbedded?: boolean;
}) {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const [h, s] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/history/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/history/stats`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);
        if (h.ok) {
          const d = await h.json();
          setEpisodes(d.episodes || []);
        }
        if (s.ok) setStats(await s.json());
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const grouped: Record<string, Episode[]> = {};
  for (const ep of episodes) {
    const d = new Date(ep.created_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(ep);
  }

  return (
    <div className={`flex flex-col ${isEmbedded ? "h-full w-full overflow-hidden" : "min-h-screen bg-background"}`}>
      
      {!isEmbedded && (
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h1 className="text-[14px] font-bold text-foreground tracking-tight">
                Study History
              </h1>
            </div>
          </div>
        </header>
      )}

      <main className={`max-w-6xl mx-auto w-full px-5 ${isEmbedded ? "flex-1 overflow-y-auto py-6" : "py-10 space-y-8"}`}>
        
        {/* -- Top Stats Grid -- */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { icon: BookOpen, label: "Sessions", value: stats.total_sessions },
              { icon: MessageSquare, label: "Messages", value: stats.total_messages },
              { icon: Flame, label: "Day Streak", value: stats.study_streak },
              { icon: TrendingUp, label: "This Week", value: stats.recent_activity },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <Icon className="w-4 h-4 text-primary mb-2" />
                <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
          
          {/* -- Sidebar: Topics -- */}
          {stats && stats.top_topics.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm sticky top-20">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Most Studied</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.top_topics.map((t) => (
                  <div
                    key={t.topic}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary/50 rounded-lg border border-border/50"
                  >
                    <span className="text-[12px] font-medium text-foreground">{t.topic}</span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-background px-1.5 rounded-md">
                      {t.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -- Main Timeline -- */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
              </div>
            ) : episodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-card border border-border border-dashed rounded-3xl">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                  <Clock className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No study history yet</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-6">Start a chat session to build your timeline.</p>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="h-10 px-6 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(grouped).map(([date, dayEps]) => (
                  <div key={date} className="relative">
                    <div className="sticky top-14 z-10 py-2 bg-background/95 backdrop-blur-sm -mx-2 px-2 flex items-center gap-3 mb-4">
                      <p className="text-[12px] font-bold text-foreground uppercase tracking-wider">
                        {date}
                      </p>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    
                    <div className="space-y-4 pl-5 border-l-2 border-secondary/50 ml-2">
                      {dayEps.map((ep) => {
                        const time = new Date(ep.created_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                        return (
                          <div key={ep.id} className="relative group">
                            <div className="absolute -left-[27px] top-5 w-3 h-3 rounded-full bg-primary ring-4 ring-background transition-transform group-hover:scale-125" />
                            <div className="p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <span className="text-[13px] font-bold text-foreground">
                                    {ep.notebooks?.title || "Notebook"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground bg-secondary/30 px-2 py-1 rounded-md">
                                  <Clock className="w-3 h-3" />
                                  <span>{time}</span>
                                  <span>·</span>
                                  <span>{ep.message_count} msg</span>
                                </div>
                              </div>
                              <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                                {ep.summary}
                              </p>
                              {(ep.topics || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {(ep.topics || []).map((t) => (
                                    <span
                                      key={t}
                                      className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-secondary/50 px-2 py-1 rounded-md"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
