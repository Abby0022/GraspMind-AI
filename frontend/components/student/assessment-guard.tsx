"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { AlertCircle, Clock, ShieldAlert } from "lucide-react";

interface AssessmentGuardProps {
  submissionId: string;
  isProctored: boolean;
  timeLimitMins: number | null;
  requireFullscreen: boolean;
  onTimeUp: () => void;
  children: React.ReactNode;
}

export function AssessmentGuard({
  submissionId,
  isProctored,
  timeLimitMins,
  requireFullscreen,
  onTimeUp,
  children,
}: AssessmentGuardProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    timeLimitMins ? timeLimitMins * 60 : null
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [integrityWarnings, setIntegrityWarnings] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Timer Logic
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, onTimeUp]);

  // 2. Proctoring: Focus Tracking
  useEffect(() => {
    if (!isProctored) return;

    const handleBlur = () => {
      setIntegrityWarnings((v) => v + 1);
      toast.error("Focus Lost: This event has been recorded for the instructor.", {
        icon: <ShieldAlert className="w-4 h-4" />,
      });
      api.assignments.recordIntegrityAlert(submissionId, "window_blur", {
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [isProctored, submissionId]);

  // 3. Proctoring: Fullscreen Management
  useEffect(() => {
    if (!requireFullscreen) return;

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        api.assignments.recordIntegrityAlert(submissionId, "fullscreen_exit", {
          timestamp: new Date().toISOString(),
        });
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [requireFullscreen, submissionId]);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {
      toast.error("Failed to enter fullscreen. Please enable it for this assessment.");
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Institutional Proctoring Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Secure Assessment Mode</p>
            <p className="text-[13px] font-semibold text-foreground">
              {isProctored ? "Monitoring Active" : "Practice Mode"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {timeLeft !== null && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${timeLeft < 60 ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-muted/50 border-border/50 text-foreground"}`}>
              <Clock className="w-4 h-4" />
              <span className="text-[14px] font-bold tabular-nums">{formatTime(timeLeft)}</span>
            </div>
          )}

          {requireFullscreen && !isFullscreen && (
            <button
              onClick={enterFullscreen}
              className="px-4 py-1.5 rounded-xl bg-foreground text-background text-[12px] font-bold hover:opacity-90 transition-all"
            >
              Enter Fullscreen
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 relative">
        {requireFullscreen && !isFullscreen ? (
          <div className="absolute inset-0 z-40 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h2 className="text-[18px] font-bold text-foreground">Fullscreen Required</h2>
            <p className="text-[14px] text-muted-foreground max-w-sm mt-2 mb-6">
              To ensure academic integrity, this assessment must be taken in fullscreen mode. 
              Navigation outside the exam window is restricted.
            </p>
            <button
              onClick={enterFullscreen}
              className="px-6 py-2.5 rounded-2xl bg-foreground text-background text-[14px] font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Return to Assessment
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full p-6">
            {children}
          </div>
        )}
      </main>

      {/* Footer / Status Bar */}
      {isProctored && (
        <div className="bg-muted/30 border-t border-border/50 px-6 py-2 flex justify-center">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Integrity Monitoring Enabled • Submitting from Authorized Session
          </p>
        </div>
      )}
    </div>
  );
}
