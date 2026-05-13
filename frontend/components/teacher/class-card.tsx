"use client";

import { type ClassListItem } from "@/lib/api";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import { useRouter } from "next/navigation";

interface ClassCardProps {
  cls: ClassListItem & { student_count?: number; avg_mastery?: number };
}

const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
  Science: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  English: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
  History: "from-rose-500/20 to-pink-500/20 border-rose-500/30",
  Physics: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  default: "from-slate-500/20 to-zinc-500/20 border-slate-500/30",
};

function getSubjectGradient(subject: string | null) {
  if (!subject) return SUBJECT_COLORS.default;
  for (const key of Object.keys(SUBJECT_COLORS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) {
      return SUBJECT_COLORS[key];
    }
  }
  return SUBJECT_COLORS.default;
}

export function ClassCard({ cls }: ClassCardProps) {
  const router = useRouter();
  const gradient = getSubjectGradient(cls.subject);
  const masteryPct = Math.round((cls.avg_mastery ?? 0) * 100);
  const circumference = 2 * Math.PI * 16;
  const dash = (masteryPct / 100) * circumference;

  return (
    <button
      type="button"
      onClick={() => router.push(`/teacher/classes/${cls.id}`)}
      className={`group relative w-full text-left rounded-2xl border bg-gradient-to-br ${gradient} p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/10`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {cls.subject ?? "General"}
          </p>
          <h3 className="font-bold text-[15px] text-foreground leading-snug truncate">
            {cls.name}
          </h3>
        </div>

        {/* Mastery ring */}
        <div className="relative flex-shrink-0 w-10 h-10">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20" cy="20" r="16"
              fill="none"
              strokeWidth="3"
              className="stroke-border/50"
            />
            <circle
              cx="20" cy="20" r="16"
              fill="none"
              strokeWidth="3"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
              className="stroke-primary transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
            {masteryPct}%
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {cls.student_count ?? 0} learners
        </span>
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {new Date(cls.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Hover arrow */}
      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-[11px] font-semibold text-primary">Open →</span>
      </div>
    </button>
  );
}
