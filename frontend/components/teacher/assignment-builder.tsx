"use client";

import { api } from "@/lib/api";
import { BookOpen, CalendarDays, FlipHorizontal, HelpCircle, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface AssignmentBuilderProps {
  classId: string;
  teacherNotebooks: { id: string; title: string }[];
  onCreated: () => void;
  onClose: () => void;
}

const TYPES = [
  { value: "read", label: "Read", icon: BookOpen, description: "Assign a notebook for students to read" },
  { value: "quiz", label: "Quiz", icon: HelpCircle, description: "Students generate & complete a quiz" },
  { value: "flashcard", label: "Flashcards", icon: FlipHorizontal, description: "Students review a flashcard deck" },
] as const;

export function AssignmentBuilder({
  classId,
  teacherNotebooks,
  onCreated,
  onClose,
}: AssignmentBuilderProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"read" | "quiz" | "flashcard">("read");
  const [notebookId, setNotebookId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Please enter a title");
    setSaving(true);
    try {
      await api.assignments.create(classId, {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        notebook_id: notebookId || undefined,
        due_date: dueDate || undefined,
      });
      toast.success("Assignment created");
      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border/50 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="font-bold text-[15px] text-foreground">New Assignment</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 3 Flashcards"
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Type *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                    type === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[12px] font-semibold">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {TYPES.find((t) => t.value === type)?.description}
            </p>
          </div>

          {/* Notebook picker */}
          {teacherNotebooks.length > 0 && (
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Link Notebook (optional)
              </label>
              <select
                value={notebookId}
                onChange={(e) => setNotebookId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              >
                <option value="">— No notebook —</option>
                {teacherNotebooks.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    {nb.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Due Date (optional)
            </label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Instructions for students…"
              className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 text-[13px] font-semibold text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? "Creating…" : "Create Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
