"use client";

import {
  BookOpen,
  Brain,
  ChevronRight,
  Clock,
  FileText,
  Key,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NavBar } from "@/components/nav-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Notebook {
  id: string;
  title: string;
  subject: string | null;
  color: string;
  created_at: string;
  source_count?: number;
}

interface UserProvider {
  provider: string;
  provider_name: string;
  model: string;
  api_key_masked: string;
  is_default: boolean;
}

export function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const supabase = createClient();
  
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  
  const [providers, setProviders] = useState<UserProvider[]>([]);

  useEffect(() => {
    loadData();
  }, [user.id]);

  async function loadData() {
    const [notebooksRes] = await Promise.all([
      supabase
        .from("notebooks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    setNotebooks(notebooksRes.data || []);

    // Load providers
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      const res = await fetch(`${API}/api/v1/providers/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {}

    setIsLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("notebooks")
        .insert({
          user_id: user.id,
          title: newTitle.trim(),
          subject: newSubject.trim() || null,
          color: "#000000",
        })
        .select()
        .single();
      if (error) throw error;
      setNotebooks((prev) => [data, ...prev]);
      setIsCreateOpen(false);
      setNewTitle("");
      setNewSubject("");
      toast.success("Notebook created");
    } catch (err: any) {
      toast.error(err.message || "Failed to create notebook");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const filtered = notebooks.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const subjectCount = new Set(notebooks.map((n) => n.subject).filter(Boolean)).size;
  const thisMonthCount = notebooks.filter(
    (n) => new Date(n.created_at).getMonth() === new Date().getMonth()
  ).length;
  const defaultProvider = providers.find((p) => p.is_default);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={handleLogout} />

      <main className="w-full max-w-6xl mx-auto px-5 pt-24 pb-16">
        
        {/* -- Top Bar: Greeting & Actions -- */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {getGreeting()}, {user.name.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ready to dive back into your studies?
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="h-10 px-5 rounded-full bg-foreground text-background text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Notebook
          </button>
        </div>

        {/* -- Bento Grid: Widgets -- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          
          {/* Widget 1: Stats */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Overview</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{notebooks.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1">Total</p>
              </div>
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{subjectCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1">Subjects</p>
              </div>
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{thisMonthCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1">Month</p>
              </div>
            </div>
          </div>

          {/* Widget 2: AI Provider Status */}
          <button 
            onClick={() => router.push("/settings")}
            className="group bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between text-left hover:border-primary/30 hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-5">
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Provider</h3>
            </div>
            {defaultProvider ? (
              <div className="flex items-center gap-3 bg-secondary/30 rounded-xl p-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{defaultProvider.provider_name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {defaultProvider.model} · {defaultProvider.api_key_masked}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-secondary/30 rounded-xl p-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <Key className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">No provider set</p>
                  <p className="text-xs text-destructive mt-0.5 font-medium">Add API key to use features →</p>
                </div>
              </div>
            )}
          </button>

          {/* Widget 3: Quick Links */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => router.push("/knowledge")}
                className="flex items-center justify-between w-full p-3 rounded-xl bg-secondary/30 hover:bg-secondary/70 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Brain className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium text-foreground">Knowledge Graph</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
              </button>
              <button 
                onClick={() => router.push("/history")}
                className="flex items-center justify-between w-full p-3 rounded-xl bg-secondary/30 hover:bg-secondary/70 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium text-foreground">Study History</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
              </button>
            </div>
          </div>

        </div>

        {/* -- Main Content: Notebooks -- */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Your Notebooks</h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notebooks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-5 rounded-full border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-card border border-border border-dashed rounded-3xl">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                {searchQuery ? (
                  <Search className="w-8 h-8 text-muted-foreground" />
                ) : (
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {searchQuery ? "No results found" : "No notebooks yet"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                {searchQuery
                  ? `Try a different search term than "${searchQuery}"`
                  : "Create your first notebook to start organizing your study materials."}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="h-10 px-6 rounded-full bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  Create Notebook
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Add New Card */}
              {!searchQuery && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="group flex flex-col items-center justify-center p-6 bg-transparent border-2 border-dashed border-border rounded-2xl h-[160px] hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-secondary group-hover:bg-primary/10 flex items-center justify-center mb-3 transition-colors">
                    <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                    New Notebook
                  </span>
                </button>
              )}

              {/* Notebook Cards */}
              {filtered.map((nb) => (
                <button
                  key={nb.id}
                  onClick={() => router.push(`/notebook/${nb.id}`)}
                  className="flex flex-col text-left p-5 bg-card border border-border rounded-2xl h-[160px] hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between w-full mb-auto">
                    <div className="w-10 h-10 rounded-xl bg-secondary group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                      <BookOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                      {formatDate(nb.created_at)}
                    </span>
                  </div>
                  <div className="mt-4 w-full">
                    <h3 className="text-base font-bold text-foreground truncate mb-1">
                      {nb.title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {nb.subject ? (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          <span className="truncate">{nb.subject}</span>
                        </>
                      ) : (
                        <span className="italic opacity-50">No subject</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* -- Create Dialog -- */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-[24px] p-0 overflow-hidden border-border/50 shadow-2xl bg-card">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight">
                New Notebook
              </DialogTitle>
              <DialogDescription className="text-[13px] mt-1.5 text-muted-foreground">
                Create a new workspace for your study materials.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <form onSubmit={handleCreate}>
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">
                  Title
                </label>
                <Input
                  placeholder="e.g. Introduction to Psychology"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  autoFocus
                  className="h-11 rounded-full text-[13px] bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">
                  Subject <span className="text-muted-foreground font-normal ml-1">(Optional)</span>
                </label>
                <Input
                  placeholder="e.g. Psychology"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="h-11 rounded-full text-[13px] bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-secondary/30 border-t border-border/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="h-10 px-5 rounded-full text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="h-10 px-6 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Notebook"
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
