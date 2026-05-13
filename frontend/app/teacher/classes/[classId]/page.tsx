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
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Tab = "overview" | "members" | "sections" | "staff" | "assignments" | "analytics";

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
  const [sections, setSections] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
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
        if (me.role === "student") { router.replace("/dashboard"); return; }
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
      if (tab === "sections") {
        const c = await api.classes.get(classId);
        setSections(c.course_sections || []);
      }
      if (tab === "staff") {
        const s = await api.classes.staff.list(classId);
        setStaff(s);
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
    if (!confirm("Remove this learner from the course?")) return;
    try {
      await api.classes.delete(`${classId}/members/${studentId}`);
      setMembers((m) => m.filter((x) => x.student_id !== studentId));
      toast.success("Learner removed from course");
    } catch {
      toast.error("Failed to remove learner");
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

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: GraduationCap },
    { id: "members", label: "Roster", icon: Users },
    { id: "sections", label: "Sections", icon: GraduationCap },
    { id: "staff", label: "Teaching Team", icon: ShieldCheck },
    { id: "assignments", label: "Coursework", icon: ClipboardList },
    { id: "analytics", label: "Performance", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={async () => { await api.auth.logout(); setUser(null); router.push("/"); }} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-16">
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
              {cls?.subject ?? "Course"}
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
              <h3 className="font-semibold text-[14px] text-foreground mb-2">Academic Continuity</h3>
              <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
                Duplicate this course structure (sections and assignments) for a new semester or session. 
                Learners and submissions will not be copied.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Clone this course for a new semester?")) return;
                  const loadToast = toast.loading("Cloning course structure...");
                  try {
                    const newCls = await api.classes.clone(classId);
                    toast.dismiss(loadToast);
                    toast.success("Course cloned successfully!");
                    router.push(`/teacher/classes/${newCls.id}`);
                  } catch {
                    toast.dismiss(loadToast);
                    toast.error("Failed to clone course");
                  }
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border/50 bg-secondary/50 text-[13px] font-bold text-foreground hover:bg-secondary transition-all"
              >
                <Copy className="w-4 h-4" />
                Clone for New Semester
              </button>
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

            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
              <h3 className="font-semibold text-[14px] text-destructive mb-2">Danger Zone</h3>
              <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
                Archiving a course hides it from your dashboard and learners' views. 
                Data is preserved for analytics but the course will become inactive.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Are you sure you want to archive this course? It will be hidden for all learners.")) return;
                  try {
                    await api.classes.archive(classId);
                    toast.success("Course archived");
                    router.push("/teacher");
                  } catch {
                    toast.error("Failed to archive course");
                  }
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-destructive/20 bg-background text-[13px] font-bold text-destructive hover:bg-destructive hover:text-background transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Archive Course
              </button>
            </div>
          </div>
        )}

        {/* -- Tab: Members -- */}
        {activeTab === "members" && (
          <MembersTable 
            members={members} 
            sections={sections}
            onRemove={removeStudent} 
            onUpdateSection={async (studentId, sectionId) => {
              try {
                await api.classes.updateMember(classId, studentId, { section_id: sectionId });
                setMembers(prev => prev.map(m => m.student_id === studentId ? { ...m, section_id: sectionId } : m));
                toast.success("Section updated");
              } catch {
                toast.error("Failed to update section");
              }
            }}
          />
        )}

        {/* -- Tab: Sections -- */}
        {activeTab === "sections" && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  const name = prompt("Section name (e.g. Lab A):");
                  if (!name) return;
                  try {
                    await api.classes.sections.create(classId, { name });
                    toast.success("Section created");
                    const c = await api.classes.get(classId);
                    setSections(c.course_sections || []);
                  } catch {
                    toast.error("Failed to create section");
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Section
              </button>
            </div>

            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/50 rounded-3xl bg-card/20">
                <p className="text-[14px] font-medium text-muted-foreground">No sections defined</p>
                <p className="text-[12px] text-muted-foreground/60 mt-1">Add labs or tutorials to manage cohorts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sections.map((s) => (
                  <div key={s.id} className="p-5 rounded-2xl border border-border/50 bg-card/60 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-[15px] text-foreground">{s.name}</h4>
                      <p className="text-[12px] text-muted-foreground mt-1">{s.room || "No room assigned"}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this section?")) return;
                        try {
                          await api.classes.sections.delete(classId, s.id);
                          setSections(prev => prev.filter(x => x.id !== s.id));
                          toast.success("Section removed");
                        } catch {
                          toast.error("Failed to delete");
                        }
                      }}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- Tab: Staff -- */}
        {activeTab === "staff" && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  const email = prompt("Enter faculty email to invite:");
                  if (!email) return;
                  try {
                    await api.classes.staff.add(classId, email);
                    toast.success("Staff member invited");
                    const s = await api.classes.staff.list(classId);
                    setStaff(s);
                  } catch (e: any) {
                    toast.error(e.message || "Failed to invite staff");
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" />
                Invite Staff
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="text-left px-6 py-4">Name</th>
                    <th className="text-left px-6 py-4">Role</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground italic">
                        No delegated staff members.
                      </td>
                    </tr>
                  ) : (
                    staff.map((s) => (
                      <tr key={s.user_id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-foreground">{(s.users || {}).name || "—"}</div>
                          <div className="text-[12px] text-muted-foreground">{(s.users || {}).email || "—"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider">
                            {s.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={async () => {
                              if (!confirm("Remove this staff member?")) return;
                              try {
                                await api.classes.staff.remove(classId, s.user_id);
                                setStaff(prev => prev.filter(x => x.user_id !== s.user_id));
                                toast.success("Staff member removed");
                              } catch {
                                toast.error("Failed to remove");
                              }
                            }}
                            className="text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
