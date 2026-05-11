"use client";

import {
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
}

interface Collaborator {
  user_id: string;
  role: string;
  profiles: { email: string };
}

export function ShareModal({ isOpen, onClose, notebookId }: ShareModalProps) {
  const [email, setEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCollaborators = async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/shares`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (res.ok) {
        setCollaborators(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCollaborators();
    }
  }, [isOpen, notebookId]);

  const handleShare = async () => {
    if (!email.trim()) return;
    setIsSharing(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/share`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email, role: "viewer" }),
        },
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to share notebook");
      }

      toast.success(`Successfully shared with ${email}`);
      setEmail("");
      fetchCollaborators();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] rounded-[32px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-rose-500/10 via-background to-background p-6">
          <DialogHeader className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-rose-600" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                Study Group
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Invite others to collaborate on this notebook. They'll be able
                to view sources and chat with the AI.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="mt-8 space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Invite by Email
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="classmate@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-2xl border-border bg-card focus:ring-rose-500/20"
                  />
                </div>
                <Button
                  onClick={handleShare}
                  disabled={!email || isSharing}
                  className="h-11 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-all shadow-lg shadow-rose-500/20"
                >
                  {isSharing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
                Collaborators
              </Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                {isLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                  </div>
                ) : collaborators.length === 0 ? (
                  <div className="py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-border">
                    <p className="text-xs text-muted-foreground italic">
                      No collaborators yet
                    </p>
                  </div>
                ) : (
                  collaborators.map((collab) => (
                    <div
                      key={collab.user_id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border group hover:border-rose-500/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                          {collab.profiles.email[0].toUpperCase()}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground">
                            {collab.profiles.email}
                          </p>
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {collab.role}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 p-2 rounded-xl hover:bg-red-50 text-red-500 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground max-w-[200px]">
              Collaborators can see all sources and chat history in this
              notebook.
            </p>
            <Button
              variant="ghost"
              onClick={onClose}
              className="rounded-xl text-sm font-semibold"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
