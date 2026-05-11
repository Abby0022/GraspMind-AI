"use client";

import { NavBar } from "@/components/nav-bar";
import { api, type Assignment, type ClassListItem } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  BookOpen,
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  ClipboardList,
  FlipHorizontal,
  GraduationCap,
  HelpCircle,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const ASSIGNMENT_ICONS = {
  read: BookOpen,
  quiz: HelpCircle,
  flashcard: FlipHorizontal,
};

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: typeof Circle }> = {
  pending: { label: "Not started", cls: "text-muted-foreground", icon: Circle },
  in_progress: { label: "In progress", cls: "text-amber-500", icon: Clock },
  submitted: { label: "Done", cls: "text-emerald-500", icon: CheckCircle },
};

export default function MyClassesPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [classes, setClasses] = useState<ClassListItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningCode, setJoiningCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const me = (await api.auth.me()) as { id: string; email: string; name: string; role: string };
        setUser(me);
        const list = await api.classes.list();
        setClasses(list);
      } catch {
        router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function selectClass(classId: string) {
    setSelectedClass(classId);
    try {
      const a = await api.assignments.list(classId);
      setAssignments(a);
    } catch {
      toast.error("Failed to load assignments");
    }
  }

  async function joinClass(e: React.FormEvent) {
    e.preventDefault();
    if (!joiningCode.trim()) return;
    setJoining(true);
    try {
      const result = (await api.classes.join(joiningCode.trim())) as { class_id: string; name: string };
      toast.success(`Joined "${result.name}"!`);
      setShowJoin(false);
      setJoiningCode("");
      // Refresh list
      const list = await api.classes.list();
      setClasses(list);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "Invalid code";
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  }

  async function markSubmitted(assignmentId: string) {
    try {
      await api.assignments.submit(assignmentId, { status: "submitted" });
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId
            ? { ...a, my_submission: { status: "submitted", score: null, submitted_at: new Date().toISOString() } }
            : a
        )
      );
      toast.success("Marked as done!");
    } catch {
      toast.error("Failed to update");
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={async () => { await api.auth.logout(); setUser(null); router.push("/"); }} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-primary" />
              <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                My Classes
              </span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Enrolled Classes</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              View assignments, track progress, and submit completed work.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowJoin(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Join Class
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-[18px] font-bold text-foreground mb-2">No classes yet</h2>
            <p className="text-[14px] text-muted-foreground max-w-xs">
              Ask your teacher for an invite code to join their class.
            </p>
            <button
              type="button"
              onClick={() => setShowJoin(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Join with invite code
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Class list */}
            <div className="space-y-2">
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => selectClass(cls.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    selectedClass === cls.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/50 bg-card/50 text-muted-foreground hover:bg-card/80 hover:text-foreground"
                  }`}
                >
                  <p className="font-semibold text-[14px]">{cls.name}</p>
                  {cls.subject && (
                    <p className="text-[11px] mt-0.5 opacity-70">{cls.subject}</p>
                  )}
                </button>
              ))}
            </div>

            {/* Assignments panel */}
            <div className="md:col-span-2">
              {!selectedClass ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[13px] text-muted-foreground">Select a class to view assignments</p>
                </div>
              ) : assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[13px] text-muted-foreground">No assignments yet in this class</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map((a) => {
                    const Icon = ASSIGNMENT_ICONS[a.type] ?? BookOpen;
                    const subStatus = a.my_submission?.status ?? "pending";
                    const { label, cls: statusCls, icon: StatusIcon } = STATUS_STYLES[subStatus] ?? STATUS_STYLES.pending;
                    const done = subStatus === "submitted";

                    return (
                      <div
                        key={a.id}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                          done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/50 bg-card/60"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[14px] text-foreground">{a.title}</p>
                          {a.description && (
                            <p className="text-[12px] text-muted-foreground mt-0.5">{a.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className={`flex items-center gap-1 text-[11px] font-semibold ${statusCls}`}>
                              <StatusIcon className="w-3 h-3" />
                              {label}
                            </span>
                            {a.due_date && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                Due {new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                        {!done && (
                          <button
                            type="button"
                            onClick={() => markSubmitted(a.id)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          >
                            Mark done
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Join class modal */}
      {showJoin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowJoin(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-background shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h2 className="font-bold text-[15px] text-foreground">Join a Class</h2>
              <button
                type="button"
                onClick={() => setShowJoin(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={joinClass} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={joiningCode}
                  onChange={(e) => setJoiningCode(e.target.value)}
                  placeholder="Paste code from your teacher"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all tracking-wider"
                />
              </div>
              <button
                type="submit"
                disabled={joining || !joiningCode.trim()}
                className="w-full py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {joining ? "Joining…" : "Join Class"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
