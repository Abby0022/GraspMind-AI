"use client";

import type { ClassAnalytics } from "@/lib/api";
import { BookOpen, Trophy, TrendingDown, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface AnalyticsChartProps {
  analytics: ClassAnalytics;
}

// Colour ramp: red → amber → emerald by score
function masteryColor(score: number) {
  if (score >= 0.7) return "#10b981"; // emerald
  if (score >= 0.4) return "#f59e0b"; // amber
  return "#ef4444"; // rose
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
        <p className="text-[22px] font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function AnalyticsChart({ analytics }: AnalyticsChartProps) {
  const avgMasteryPct = Math.round(analytics.avg_mastery * 100);
  const completionPct = Math.round(analytics.assignment_completion_rate * 100);

  // Per-student data for the bar chart
  const studentData = analytics.per_student.map((s) => ({
    name: s.name.split(" ")[0] || "Student",
    mastery: Math.round(s.avg_mastery * 100),
    quizzes: s.quizzes_done,
  }));

  // Weakest concepts bar chart data
  const conceptData = analytics.weakest_concepts.map((c, i) => ({
    concept: c.length > 18 ? `${c.slice(0, 18)}…` : c,
    index: i + 1,
  }));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Students" value={analytics.student_count} />
        <StatCard
          icon={Trophy}
          label="Avg Mastery"
          value={`${avgMasteryPct}%`}
          sub="across all topics"
        />
        <StatCard
          icon={BookOpen}
          label="Completion"
          value={`${completionPct}%`}
          sub="assignments submitted"
        />
        <StatCard
          icon={TrendingDown}
          label="Weak Topics"
          value={analytics.weakest_concepts.length}
          sub="need attention"
        />
      </div>

      {/* Per-student mastery bar chart */}
      {studentData.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-5">
          <h4 className="text-[13px] font-semibold text-foreground mb-4">
            Student Mastery Overview
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={studentData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)/0.3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[12px] shadow-lg">
                      <p className="font-semibold text-foreground">{d.name}</p>
                      <p className="text-muted-foreground">Mastery: <span className="text-foreground font-bold">{d.mastery}%</span></p>
                      <p className="text-muted-foreground">Quizzes: <span className="text-foreground font-bold">{d.quizzes}</span></p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="mastery" radius={[4, 4, 0, 0]}>
                {studentData.map((entry, i) => (
                  <Cell key={i} fill={masteryColor(entry.mastery / 100)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weakest concepts list */}
      {analytics.weakest_concepts.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-5">
          <h4 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            Weakest Concepts
          </h4>
          <ol className="space-y-2">
            {analytics.weakest_concepts.map((concept, i) => (
              <li
                key={concept}
                className="flex items-center gap-3 text-[13px]"
              >
                <span className="w-5 h-5 rounded-full bg-rose-500/10 flex items-center justify-center text-[10px] font-bold text-rose-500 flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground font-medium">{concept}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
