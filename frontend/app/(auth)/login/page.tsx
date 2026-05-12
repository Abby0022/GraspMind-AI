"use client";

import { Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

/* -- OAuth provider icons (SVG inline) --------------------─ */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/* -- Decorative right panel mockup ------------------------─ */
function DashboardMockup() {
  const items = [
    { initials: "EM", name: "Emily Morrison", email: "emily@uni.edu" },
    { initials: "JC", name: "James Chen", email: "james@uni.edu" },
    { initials: "SR", name: "Sofia Ramirez", email: "sofia@uni.edu" },
    { initials: "NK", name: "Noah Kim", email: "noah@uni.edu" },
  ];
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[#f0f0f0]">
          <div className="w-8 h-8 rounded-xl bg-[#f4f4f5] flex items-center justify-center">
            <svg
              className="w-4 h-4 text-[#888]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111]">
              Your Study Notebooks
            </p>
            <p className="text-xs text-[#888]">AI-powered study assistant</p>
          </div>
        </div>

        {/* Study tools row */}
        <div className="p-4 border-b border-[#f0f0f0]">
          <p className="text-xs font-medium text-[#888] mb-3">Study Tools</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Quizzes", val: "48" },
              { label: "Flashcards", val: "120" },
              { label: "Sessions", val: "32" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-[#f8f8f8] rounded-xl p-3 text-center"
              >
                <p className="text-base font-bold text-[#111]">{s.val}</p>
                <p className="text-[10px] text-[#888] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Members with access */}
        <div className="p-4">
          <p className="text-xs font-medium text-[#888] mb-3">Study Group</p>
          <div className="space-y-3">
            {items.map((m) => (
              <div key={m.email} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#111] flex items-center justify-center text-[10px] font-semibold text-white">
                    {m.initials}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#111] leading-none">
                      {m.name}
                    </p>
                    <p className="text-[10px] text-[#888] mt-0.5">{m.email}</p>
                  </div>
                </div>
                <span className="text-[10px] text-[#888] bg-[#f4f4f5] px-2 py-0.5 rounded-md">
                  can view
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#f8f8f8] border border-[#eee]">
            <div className="w-7 h-7 rounded-xl bg-[#e5e5e5] flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-[#888]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-[#111]">Share with link</p>
              <p className="text-[10px] text-[#888]">
                Anyone with the link can join
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Main Login Page --------------------------------------─ */
export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const supabase = createClient();
      
      // 1. Sign in via Supabase client to set SSR cookies for Next.js Server Components
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      // 2. Sign in via backend to set HttpOnly cookies for FastAPI dependencies
      const result = await api.auth.login({ email, password }) as { user: { role: string; name: string; email: string; id: string } };
      
      setUser(result.user as Parameters<typeof setUser>[0]);
      toast.success("Welcome back!");
      router.push(result.user.role === "teacher" ? "/teacher" : "/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const detail = err && typeof err === "object" && "message" in err 
        ? String((err as { message: string }).message) 
        : "An unexpected error occurred";
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple" | "twitter") {
    setOauthLoading(provider);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) toast.error(error.message);
    } catch {
      toast.error("OAuth sign-in failed");
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f1f3] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-sm border border-[#e5e5e5] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[580px]">
          {/* -- Left: Form ------------------------------─ */}
          <div className="flex flex-col p-8 lg:p-12">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-auto">
              <img src="/grasp.svg" alt="GraspMind AI Logo" className="w-8 h-8 object-contain dark:invert" />
              <div>
                <p className="text-sm font-semibold text-[#111] leading-none">
                  GraspMind AI
                </p>
                <p className="text-[10px] text-[#888]">AI Study Platform</p>
              </div>
            </div>

            {/* Form */}
            <div className="py-8">
              <h1 className="text-2xl font-bold text-[#111] mb-1">
                Welcome back
              </h1>
              <p className="text-sm text-[#888] mb-6">
                Enter your email and password to sign in.
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#555]">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaa]" />
                    <Input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="pl-10 h-11 rounded-full border border-border bg-secondary/30 text-sm text-[#111] placeholder:text-[#bbb] hover:bg-secondary/50 hover:border-foreground/20 focus-visible:bg-white focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/5 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#555]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaa]" />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-10 h-11 rounded-full border border-border bg-secondary/30 text-sm text-[#111] placeholder:text-[#bbb] hover:bg-secondary/50 hover:border-foreground/20 focus-visible:bg-white focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/5 transition-all outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-[#111] text-white text-sm font-semibold rounded-full hover:bg-[#222] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {isLoading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-[#eee]" />
                <span className="text-xs text-[#aaa]">Or sign in with</span>
                <div className="flex-1 h-px bg-[#eee]" />
              </div>

              {/* OAuth buttons */}
              <div className="flex items-center justify-center gap-3">
                {[
                  { id: "apple" as const, icon: <AppleIcon />, label: "Apple" },
                  { id: "twitter" as const, icon: <XIcon />, label: "X" },
                  {
                    id: "google" as const,
                    icon: <GoogleIcon />,
                    label: "Google",
                  },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleOAuth(p.id)}
                    disabled={oauthLoading !== null}
                    className="w-12 h-10 rounded-xl border border-[#e5e5e5] bg-white hover:bg-[#f8f8f8] transition-colors flex items-center justify-center disabled:opacity-50"
                    aria-label={`Sign in with ${p.label}`}
                  >
                    {oauthLoading === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#888]" />
                    ) : (
                      p.icon
                    )}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-[#888] text-center mt-auto">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-[#111] font-medium hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>

          {/* -- Right: Decorative mockup ------------------ */}
          <div className="hidden lg:flex items-center justify-center p-8 bg-[#f8f8f8] border-l border-[#eee]">
            <DashboardMockup />
          </div>
        </div>
      </div>

      <p className="absolute bottom-4 text-[11px] text-[#aaa]">
        Built by <span className="font-medium text-[#888]">GraspMind AI</span>
      </p>
    </div>
  );
}
