"use client";

import { ClassCard } from "@/components/teacher/class-card";
import { NavBar } from "@/components/nav-bar";
import { api, type ClassDetail } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useTeacherStore } from "@/lib/store";
import {
  BookOpen,
  GraduationCap,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function TeacherDashboard() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { classes, setClasses, addClass, isLoading, setLoading } = useTeacherStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);

  // Auth guard + hydrate
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const me = (await api.auth.me()) as { id: string; email: string; name: string; role: string };
        if (me.role !== "teacher") {
          router.replace("/dashboard");
          return;
        }
        setUser(me);
        const list = await api.classes.list();
        setClasses(list);
      } catch {
        router.replace("/dashboard");
      }
    }
    init();
  }, []);

  async function handleLogout() {
    await api.auth.logout();
    setUser(null);
    router.push("/");
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const cls = (await api.classes.create({
        name: newName.trim(),
        subject: newSubject.trim() || undefined,
      })) as ClassDetail;
      addClass(cls);
      setShowCreate(false);
      setNewName("");
      setNewSubject("");
      toast.success("Class created!");
      router.push(`/teacher/classes/${cls.id}`);
    } catch {
      toast.error("Failed to create class");
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={handleLogout} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-primary" />
              <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                Teacher Portal
              </span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">My Classes</h1>
            <p className="text-muted-foreground text-[14px] mt-1">
              Manage your classes, track student progress, and create assignments.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Class
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {[
            { label: "Total Classes", value: classes.length, icon: BookOpen },
            {
              label: "Total Students",
              value: "—",
              icon: Users,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-border/50 bg-card/50 p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                <p className="text-[20px] font-bold text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Classes grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-border/30 bg-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-[18px] font-bold text-foreground mb-2">No classes yet</h2>
            <p className="text-muted-foreground text-[14px] max-w-xs">
              Create your first class and share the invite code with your students.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create your first class
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <ClassCard key={cls.id} cls={cls} />
            ))}
          </div>
        )}
      </main>

      {/* Create class modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-background shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h2 className="font-bold text-[15px] text-foreground">Create a Class</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={createClass} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Class Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Grade 10 Physics"
                  maxLength={120}
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Subject (optional)
                </label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Physics"
                  maxLength={100}
                  className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 text-[13px] font-semibold text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {creating ? "Creating…" : "Create Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
