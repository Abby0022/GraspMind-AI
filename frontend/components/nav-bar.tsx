"use client";

import { Clock, GraduationCap, LogOut, Settings, Target } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

interface NavBarProps {
  user: {
    name: string;
    role: string;
  };
  onLogout: () => void;
}

export function NavBar({ user, onLogout }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="sticky top-6 z-50 px-4 sm:px-6 w-full flex justify-center pointer-events-none">
      <header className="h-[56px] w-full max-w-6xl border border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-full flex items-center justify-between px-5 transition-all duration-300 pointer-events-auto">
      <div className="flex items-center gap-8">
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => router.push("/dashboard")}
        >
          <div className="w-9 h-9 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
            <img src="/grasp.svg" alt="GraspMind AI Logo" className="w-8 h-8 object-contain dark:invert" />
          </div>
          <span className="font-bold text-[15px] text-foreground tracking-tight">
            GraspMind AI
          </span>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => router.push("/dashboard")}
            className={`flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-medium transition-colors ${
              pathname === "/dashboard"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/history")}
            className={`flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-medium transition-colors ${
              pathname === "/history"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}
          >
            <Clock className="w-4 h-4" />
            History
          </button>
          <button
            onClick={() => router.push("/knowledge")}
            className={`flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-medium transition-colors ${
              pathname === "/knowledge"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}
          >
            <Target className="w-4 h-4" />
            Knowledge
          </button>

          {/* Role-conditional nav items */}
          {user.role === "teacher" ? (
            <button
              onClick={() => router.push("/teacher")}
              className={`flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-medium transition-colors ${
                pathname.startsWith("/teacher")
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Teaching
            </button>
          ) : (
            <button
              onClick={() => router.push("/classes")}
              className={`flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-medium transition-colors ${
                pathname === "/classes"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Classes
            </button>
          )}
        </nav>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/settings")}
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <ThemeToggle />

        <div className="h-5 w-px bg-border/60 hidden sm:block mx-2" />

        {/* User Profile */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end justify-center">
            <span className="text-[13px] font-bold text-foreground leading-tight">
              {user.name}
            </span>
            <span className="text-[11px] text-muted-foreground capitalize leading-tight">
              {user.role}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-[13px] font-bold text-foreground border border-border shadow-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={onLogout}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </header>
    </div>
  );
}
