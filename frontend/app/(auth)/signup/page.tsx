"use client";

import { GraduationCap, Loader2, Lock, Mail, Presentation, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

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

function DashboardMockup() {
  const concepts = [
    { label: "Cell Biology", pct: 88 },
    { label: "Organic Chemistry", pct: 62 },
    { label: "Thermodynamics", pct: 74 },
    { label: "Linear Algebra", pct: 95 },
  ];
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm overflow-hidden">
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
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111]">
              Knowledge Mastery
            </p>
            <p className="text-xs text-[#888]">Track your progress</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {concepts.map((c) => (
            <div key={c.label} className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#555]">{c.label}</span>
                <span className="text-xs font-medium text-[#111]">
                  {c.pct}%
                </span>
              </div>
              <div className="h-1.5 bg-[#f4f4f5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#111] rounded-full transition-all"
                  style={{ width: `${c.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#f8f8f8] rounded-xl p-3">
              <p className="text-lg font-bold text-[#111]">347</p>
              <p className="text-[10px] text-[#888]">Cards reviewed</p>
            </div>
            <div className="bg-[#f8f8f8] rounded-xl p-3">
              <p className="text-lg font-bold text-[#111]">12</p>
              <p className="text-[10px] text-[#888]">Day streak</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#111] text-white">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
            <div>
              <p className="text-xs font-medium leading-none">
                AI Study Recommendation
              </p>
              <p className="text-[10px] text-white/60 mt-0.5">
                Review Organic Chemistry today
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [teacherCode, setTeacherCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please agree to the terms and conditions");
      return;
    }
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters");
      return;
    }
    if (role === "teacher" && !teacherCode.trim()) {
      toast.error("Please enter your teacher access code");
      return;
    }
    setIsLoading(true);
    try {
      // All signups go through our backend so that:
      // - teacher_code is validated server-side (cannot be bypassed)
      // - role is assigned by the backend, never by user input
      // - cookies are set automatically (user is logged in immediately if verification is off)
      const result = (await api.auth.signup({
        name,
        email,
        password,
        ...(role === "teacher" ? { teacher_code: teacherCode.trim() } : {}),
      })) as {
        user?: { role: string; name: string; email: string; id: string };
        verification_required?: boolean;
      };

      if (result.verification_required) {
        setVerificationRequired(true);
        toast.success("Account created! Please check your email to verify your account.");
        return;
      }

      // Also sign in via Supabase browser client to set the Next.js SSR cookies
      const supabase = createClient();
      await supabase.auth.signInWithPassword({ email, password });

      if (result.user) {
        setUser(result.user as Parameters<typeof setUser>[0]);
      }
      toast.success(
        role === "teacher"
          ? "Teacher account created! Welcome to GraspMind AI."
          : "Account created! Welcome to GraspMind AI."
      );
      // Backend already set cookies — go straight to dashboard
      router.push(role === "teacher" ? "/teacher" : "/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "An unexpected error occurred";
      // Surface the 403 message clearly for bad teacher codes
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
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) toast.error(error.message);
    } catch {
      toast.error("OAuth sign-up failed");
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f1f3] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-sm border border-[#e5e5e5] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[620px]">
          {/* -- Left: Form ------------------------------─ */}
          <div className="flex flex-col p-8 lg:p-12">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-auto">
              <Image 
                src="/grasp.svg" 
                alt="GraspMind AI Logo" 
                width={32} 
                height={32}
                priority
                className="object-contain dark:invert" 
              />
              <div>
                <p className="text-sm font-semibold text-[#111] leading-none">
                  GraspMind AI
                </p>
                <p className="text-[10px] text-[#888]">AI Study Platform</p>
              </div>
            </div>

            {/* Form */}
            <div className="py-8">
              {verificationRequired ? (
                <div className="text-center space-y-6 py-12">
                  <div className="w-16 h-16 bg-[#f4f4f5] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Mail className="w-8 h-8 text-[#111]" />
                  </div>
                  <h1 className="text-2xl font-bold text-[#111]">Check your email</h1>
                  <p className="text-sm text-[#888] max-w-sm mx-auto leading-relaxed">
                    We've sent a verification link to <span className="font-semibold text-[#111]">{email}</span>.
                    Please click the link in the email to activate your account.
                  </p>
                  <div className="pt-8">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center h-10 px-8 bg-[#111] text-white text-sm font-medium rounded-xl hover:bg-[#222] transition-colors"
                    >
                      Back to login
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-[#111] mb-1">
                    Create account
                  </h1>
                  <p className="text-sm text-[#888] mb-6">
                    Enter your Email and Password to create your account.
                  </p>

                  <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#555]">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaa]" />
                    <Input
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className="pl-9 h-10 rounded-xl border-[#e5e5e5] bg-white text-sm text-[#111] placeholder:text-[#bbb] focus-visible:ring-1 focus-visible:ring-[#111] focus-visible:border-[#111]"
                    />
                  </div>
                </div>

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
                      className="pl-9 h-10 rounded-xl border-[#e5e5e5] bg-white text-sm text-[#111] placeholder:text-[#bbb] focus-visible:ring-1 focus-visible:ring-[#111] focus-visible:border-[#111]"
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
                      minLength={10}
                      autoComplete="new-password"
                      className="pl-9 h-10 rounded-xl border-[#e5e5e5] bg-white text-sm text-[#111] placeholder:text-[#bbb] focus-visible:ring-1 focus-visible:ring-[#111] focus-visible:border-[#111]"
                    />
                  </div>
                </div>

                {/* Account Type toggle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#555]">Account Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["student", "teacher"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => { setRole(r); setTeacherCode(""); }}
                        className={`flex items-center justify-center gap-2 h-10 rounded-xl border text-sm font-medium transition-all ${
                          role === r
                            ? "bg-[#111] text-white border-[#111]"
                            : "bg-white text-[#555] border-[#e5e5e5] hover:border-[#aaa]"
                        }`}
                      >
                        {r === "student" ? (
                          <>
                            <GraduationCap className="w-4 h-4" />
                            Student
                          </>
                        ) : (
                          <>
                            <Presentation className="w-4 h-4" />
                            Teacher
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Teacher Access Code — only visible when Teacher is selected */}
                {role === "teacher" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#555] flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" />
                      Teacher Access Code
                      <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaa]" />
                      <Input
                        type="password"
                        placeholder="Enter your institution access code"
                        value={teacherCode}
                        onChange={(e) => setTeacherCode(e.target.value)}
                        required
                        autoComplete="off"
                        className="pl-10 h-11 rounded-full border border-border bg-secondary/30 text-sm text-[#111] placeholder:text-[#bbb] hover:bg-secondary/50 hover:border-foreground/20 focus-visible:bg-white focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/5 transition-all outline-none"
                      />
                    </div>
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-1">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        This code is provided by your institution administrator. Without a valid code, teacher accounts cannot be created.
                      </p>
                    </div>
                  </div>
                )}


                {/* Terms checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${agreed ? "bg-[#111] border-[#111]" : "bg-white border-[#ddd] group-hover:border-[#aaa]"}`}
                    >
                      {agreed && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[#555]">
                    I agree with{" "}
                    <span className="text-[#111] font-medium underline underline-offset-2">
                      term &amp; conditions
                    </span>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-[#111] text-white text-sm font-semibold rounded-full hover:bg-[#222] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {isLoading ? "Creating account..." : "Sign Up"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-[#eee]" />
                <span className="text-xs text-[#aaa]">Or sign up with</span>
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
                    aria-label={`Sign up with ${p.label}`}
                  >
                    {oauthLoading === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#888]" />
                    ) : (
                      p.icon
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

            <p className="text-xs text-[#888] text-center mt-auto">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-[#111] font-medium hover:underline"
              >
                Log in
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
