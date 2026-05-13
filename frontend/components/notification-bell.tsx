"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Trash2, Inbox } from "lucide-react";
import { api, type Notification } from "@/lib/api";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  async function fetchNotifications() {
    try {
      const list = await api.notifications.list();
      setNotifications(list);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }

  useEffect(() => {
    fetchNotifications();
    // Refresh every minute
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markAsRead(id: string) {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {}
  }

  async function deleteNotification(id: string) {
    try {
      await api.notifications.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  }

  async function handleAction(n: Notification) {
    if (!n.is_read) {
      await markAsRead(n.id);
    }
    setIsOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors relative"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-background animate-pulse" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop for closing */}
          <div 
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute right-0 mt-3 w-80 max-h-[480px] overflow-hidden bg-background border border-border shadow-2xl rounded-3xl z-50 flex flex-col animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-card/50">
              <h3 className="font-bold text-[14px]">Notifications</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={async () => {
                    await api.notifications.readAll();
                    fetchNotifications();
                  }}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                    <Inbox className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-[12px] font-medium text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`group px-5 py-4 transition-colors relative border-b border-border/30 last:border-0 ${
                      n.is_read ? "opacity-60" : "bg-primary/[0.01]"
                    } hover:bg-secondary/40`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${!n.is_read ? "bg-primary" : "bg-transparent"}`} />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleAction(n)}>
                        <p className="text-[13px] font-bold text-foreground leading-tight mb-1">
                          {n.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-2 font-medium">
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!n.is_read && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                            className="p-1.5 rounded-lg hover:bg-background border border-transparent hover:border-border text-primary transition-all"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button 
                           onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                           className="p-1.5 rounded-lg hover:bg-background border border-transparent hover:border-border text-muted-foreground hover:text-destructive transition-all"
                           title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {notifications.length > 5 && (
              <div className="px-5 py-3 bg-secondary/20 border-t border-border/50">
                <button 
                  onClick={() => { setIsOpen(false); router.push("/notifications"); }}
                  className="w-full text-center text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  See all activity
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
