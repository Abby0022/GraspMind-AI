"use client";

import type { ClassMember } from "@/lib/api";
import { ArrowUpDown, Mail, Trophy, User } from "lucide-react";
import { useState } from "react";

interface MembersTableProps {
  members: ClassMember[];
  sections?: any[];
  onRemove?: (studentId: string) => void;
  onUpdateSection?: (studentId: string, sectionId: string | null) => void;
}

type SortKey = "name" | "avg_mastery" | "joined_at";

function MasteryBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70
      ? "bg-emerald-500"
      : pct >= 40
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-semibold tabular-nums w-8 text-right text-foreground">
        {pct}%
      </span>
    </div>
  );
}

export function MembersTable({ members, sections, onRemove, onUpdateSection }: MembersTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("joined_at");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const sorted = [...members].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "avg_mastery") cmp = a.avg_mastery - b.avg_mastery;
    else cmp = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    return sortAsc ? cmp : -cmp;
  });

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <User className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-[14px] font-medium text-muted-foreground">No students enrolled yet</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1">Share the invite code to get started</p>
      </div>
    );
  }

  function SortButton({ label, k }: { label: string; k: SortKey }) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-primary" : ""}`} />
      </button>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="text-left px-4 py-3">
              <SortButton label="Student" k="name" />
            </th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">
              <SortButton label="Avg Mastery" k="avg_mastery" />
            </th>
            <th className="text-left px-4 py-3 hidden md:table-cell">
              <SortButton label="Joined" k="joined_at" />
            </th>
            <th className="text-left px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Section</span>
            </th>
            {onRemove && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr
              key={m.student_id}
              className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary flex-shrink-0">
                    {m.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-[13px] truncate">{m.name || "—"}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      {m.email}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell w-40">
                <MasteryBar value={m.avg_mastery} />
              </td>
              <td className="px-4 py-3 hidden md:table-cell text-[12px] text-muted-foreground">
                {new Date(m.joined_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3">
                <select
                  value={m.section_id || ""}
                  onChange={(e) => onUpdateSection?.(m.student_id, e.target.value || null)}
                  className="bg-background border border-border/50 rounded-lg px-2 py-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[120px]"
                >
                  <option value="">No Section</option>
                  {sections?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </td>
              {onRemove && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(m.student_id)}
                    className="text-[11px] text-rose-500 hover:text-rose-600 font-medium transition-colors"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
