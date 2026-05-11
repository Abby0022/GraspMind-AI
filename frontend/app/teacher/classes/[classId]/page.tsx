"use client";

import { AnalyticsChart } from "@/components/teacher/analytics-chart";
import { AssignmentBuilder } from "@/components/teacher/assignment-builder";
import { MembersTable } from "@/components/teacher/members-table";
import { NavBar } from "@/components/nav-bar";
import { api, type Assignment, type ClassAnalytics, type ClassDetail, type ClassMember } from "@/lib/api";
import { useAuthStore, useTeacherStore } from "@/lib/store";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  ClipboardList,
  Copy,
  FlipHorizontal,
  GraduationCap,
  HelpCircle,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Tab = "overview" | "members" | "assignments" | "analytics";

const ASSIGNMENT_ICONS = {
  read: BookOpen,
  quiz: HelpCircle,
  flashcard: FlipHorizontal,
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  pending: { label: "Not started", color: "text-muted-foreground", icon: Circle },
  in_progress: { label: "In progress", color: "text-amber-500", icon: Clock },
  submitted: { label: "Submitted", color: "text-emerald-500", icon: CheckCircle },
};

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { setAnalytics } = useTeacherStore();

  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [analytics, setLocalAnalytics] = useState<ClassAnalytics | null>(null);
  const [teacherNotebooks, setTeacherNotebooks] = useState<{ id: string; title: string }[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const me = (await api.auth.me()) as { id: string; email: string; name: string; role: string };
        if (me.role !== "teacher") { router.replace("/dashboard"); return; }
        setUser(me);

        const [clsData, nbData] = await Promise.all([
          api.classes.get(classId),
          api.notebooks.list(),
        ]);
        setCls(clsData as ClassDetail);
        setTeacherNotebooks((nbData as { id: string; title: string }[]) || []);
      } catch {
        router.replace("/teacher");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [classId]);

  async function loadTab(tab: Tab) {
    setActiveTab(tab);
    try {
      if (tab === "members" && members.length === 0) {
        const m = await api.classes.members(classId);
        setMembers(m);
      }
      if (tab === "assignments" && assignments.length === 0) {
        const a = await api.assignments.list(classId);
        setAssignments(a);
      }
      if (tab === "analytics" && !analytics) {
        const d = await api.classes.analytics(classId);
        setLocalAnalytics(d);
        setAnalytics(d);
      }
    } catch {
      toast.error("Failed to load data");
    }
  }

  async function removeStudent(studentId: string) {
    if (!confirm("Remove this student from the class?")) return;
    try {
      await api.classes.delete(`${classId}/members/${studentId}`);
      setMembers((m) => m.filter((x) => x.student_id !== studentId));
      toast.success("Student removed");
    } catch {
      toast.error("Failed to remove student");
    }
  }

  function copyInviteCode() {
    if (!cls?.invite_code) return;
    navigator.clipboard.writeText(cls.invite_code);
    toast.success("Invite code copied!");
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "overview", label: "Overview", icon: GraduationCap },
    { id: "members", label: "Members", icon: Users },
    { id: "assignments", label: "Assignments", icon: ClipboardList },
    { id: "analytics", label: "Analytics", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={async () => { await api.auth.logout(); setUser(null); router.push("/"); }} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => router.push("/teacher")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">
              {cls?.subject ?? "Class"}
            </p>
            <h1 className="text-[22px] font-bold text-foreground">{cls?.name ?? "Loading…"}</h1>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-border/50 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => loadTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* -- Tab: Overview -- */}
        {activeTab === "overview" && cls && (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border border-border/50 bg-card/60 p-6 space-y-4">
              <h3 className="font-semibold text-[14px] text-foreground">Invite Code</h3>
              <div className="flex items-center gap-3">
                <code className="flex-1 font-mono text-[18px] font-bold tracking-widest text-foreground bg-muted/50 rounded-xl px-4 py-3 border border-border/50">
                  {cls.invite_code}
                </code>
                <button
                  type="button"
                  onClick={copyInviteCode}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border/50 text-[13px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Share this code with students so they can join at{" "}
                <span className="font-semibold text-foreground">grasp.app/classes</span>
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/60 p-6">
              <h3 className="font-semibold text-[14px] text-foreground mb-2">Class Info</h3>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subject</dt>
                  <dd className="text-foreground font-medium">{cls.subject ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-foreground font-medium">
                    {new Date(cls.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* -- Tab: Members -- */}
        {activeTab === "members" && (
          <MembersTable members={members} onRemove={removeStudent} />
        )}

        {/* -- Tab: Assignments -- */}
        {activeTab === "assignments" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowBuilder(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" />
                New Assignment
              </button>
            </div>

            {assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ClipboardList className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-[14px] font-medium text-muted-foreground">No assignments yet</p>
                <p className="text-[12px] text-muted-foreground/60 mt-1">Create one to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((a) => {
                  const Icon = ASSIGNMENT_ICONS[a.type] ?? BookOpen;
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card/60 hover:bg-card/80 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px] text-foreground truncate">{a.title}</p>
                        {a.description && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{a.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">
                            {a.type}
                          </span>
                          {a.due_date && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              Due {new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -- Tab: Analytics -- */}
        {activeTab === "analytics" && (
          analytics ? (
            <AnalyticsChart analytics={analytics} />
          ) : (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )
        )}
      </main>

      {/* Assignment builder modal */}
      {showBuilder && (
        <AssignmentBuilder
          classId={classId}
          teacherNotebooks={teacherNotebooks}
          onCreated={async () => {
            const a = await api.assignments.list(classId);
            setAssignments(a);
          }}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
