"use client";

import { NavBar } from "@/components/nav-bar";
import { api, type Notification } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Bell, Check, Trash2, Calendar, Inbox, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchNotifications() {
    try {
      const list = await api.notifications.list();
      setNotifications(list);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const me = (await api.auth.me()) as { id: string; email: string; name: string; role: string };
        setUser(me);
        await fetchNotifications();
      } catch {
        router.replace("/dashboard");
      }
    }
    init();
  }, []);

  async function handleAction(n: Notification) {
    if (!n.is_read) {
      await api.notifications.markRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.link) {
      router.push(n.link);
    }
  }

  async function deleteOne(id: string) {
    try {
      await api.notifications.delete(id);
      setNotifications(prev => prev.filter(x => x.id !== id));
      toast.success("Notification removed");
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={async () => { await api.auth.logout(); setUser(null); router.push("/"); }} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-primary" />
              <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                Activity Feed
              </span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              Stay updated on new coursework, course updates, and faculty alerts.
            </p>
          </div>

          {notifications.length > 0 && (
            <button
              onClick={async () => {
                await api.notifications.readAll();
                fetchNotifications();
                toast.success("All caught up!");
              }}
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-card/30 border border-border/50 rounded-[32px] text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <h2 className="text-[18px] font-bold text-foreground mb-1">No notifications yet</h2>
            <p className="text-[14px] text-muted-foreground max-w-xs">
              Check back later for updates from your professors or course alerts.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`group flex items-start gap-4 p-5 rounded-[24px] border transition-all ${
                  n.is_read 
                    ? "bg-card/40 border-border/40 opacity-75" 
                    : "bg-card border-border shadow-sm shadow-primary/5"
                } hover:border-primary/20 hover:bg-card`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  n.is_read ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary"
                }`}>
                  <Bell className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleAction(n)}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[15px] text-foreground">{n.title}</h3>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    {n.message}
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60">
                      <Calendar className="w-3 h-3" />
                      {new Date(n.created_at).toLocaleDateString("en-US", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {n.link && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-primary group-hover:translate-x-1 transition-transform">
                        View Details
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
