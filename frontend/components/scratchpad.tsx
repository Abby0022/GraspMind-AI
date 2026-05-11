"use client";

import { FileText, Loader2, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface ScratchpadProps {
  notebookId: string;
  initialContent: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveContent: (newContent: string) => void;
}

export function Scratchpad({
  notebookId,
  initialContent,
  isOpen,
  onClose,
  onSaveContent,
}: ScratchpadProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    // Debounce save
    const timeoutId = setTimeout(async () => {
      if (content === initialContent) return;
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from("notebooks")
          .update({ scratchpad: content, updated_at: new Date().toISOString() })
          .eq("id", notebookId);
        if (error) throw error;
        onSaveContent(content); // Update parent state to match
      } catch (err) {
        console.error("Failed to save scratchpad:", err);
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [content, notebookId, initialContent, onSaveContent]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-[72px] right-2 w-[340px] h-[450px] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-[#e8eaed] flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="flex items-center justify-between p-4 border-b border-[#e8eaed] bg-[#f8f9fa] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#e8eaed] flex items-center justify-center">
            <FileText className="w-3 h-3 text-[#5f6368]" />
          </div>
          <h3 className="text-[13px] font-semibold text-[#202124]">
            Quick Notes
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-[#9aa0a6]">
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-3 h-3" /> Saved
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[#e8eaed] transition-colors text-[#5f6368]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Jot down keywords, mnemonics, or important concepts here. These notes are automatically saved to this notebook..."
        className="flex-1 w-full p-5 text-[14px] text-[#202124] leading-relaxed placeholder:text-[#bdc1c6] outline-none resize-none bg-white no-scrollbar"
        spellCheck={false}
      />
    </div>
  );
}
