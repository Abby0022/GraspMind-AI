"use client";

import { Bookmark, CheckCircle2, Copy, ExternalLink, Link } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ConnectClientProps {
  notebookId: string;
  isEmbedded?: boolean;
}

export function ConnectClient({
  notebookId,
  isEmbedded = false,
}: ConnectClientProps) {
  const [copied, setCopied] = useState(false);

  const bookmarkletCode = `javascript:(function(){
    var text = window.getSelection().toString();
    if (!text) {
      alert('Please select some text first!');
      return;
    }
    var title = document.title || 'Web Snippet';
    var url = window.location.origin + '/ingest?notebook_id=${notebookId}&text=' + encodeURIComponent(text) + '&title=' + encodeURIComponent(title);
    window.open(url, 'NexMindIngest', 'width=500,height=600,location=no,menubar=no,toolbar=no');
  })();`.replace(/\s+/g, " ");

  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    toast.success("Bookmarklet code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex flex-col h-full ${isEmbedded ? "bg-transparent" : "bg-background p-6"}`}
    >
      <div className="max-w-2xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="space-y-3 pb-4">
          <h1 className="text-[32px] font-bold tracking-tight text-foreground flex items-center gap-3">
            <Link className="w-8 h-8 text-rose-500" />
            Universal Connector
          </h1>
          <p className="text-[16px] text-muted-foreground">
            Save highlights from any website directly into this notebook using
            our Bookmarklet.
          </p>
        </div>

        <div className="grid gap-8">
          {/* Step 1 */}
          <div className="bg-card border border-border rounded-[32px] p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-5">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 text-rose-600 font-bold text-base">
                1
              </div>
              <div className="space-y-1 mt-1">
                <h3 className="text-lg font-semibold text-foreground tracking-tight">
                  Add to Bookmarks
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  Copy the code below and create a new bookmark in your browser.
                  Paste this code as the URL (Address).
                </p>
              </div>
            </div>

            <div className="relative group ml-15 pl-15">
              <div className="w-full bg-muted rounded-2xl p-5 font-mono text-[12px] break-all text-muted-foreground border border-border pr-14 leading-relaxed">
                {bookmarkletCode}
              </div>
              <button
                onClick={handleCopy}
                className="absolute right-4 top-4 p-2.5 rounded-xl bg-card border border-border shadow-sm hover:bg-secondary transition-all"
                title="Copy Bookmarklet Code"
              >
                {copied ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-card border border-border rounded-[32px] p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-5">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 text-rose-600 font-bold text-base">
                2
              </div>
              <div className="space-y-1 mt-1">
                <h3 className="text-lg font-semibold text-foreground tracking-tight">
                  Highlight & Save
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  Go to any website, highlight the text you want to learn, and
                  click your new bookmark. It will automatically be added to
                  your NexMind sources.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">
              <Bookmark className="w-5 h-5 text-rose-500" />
              <span className="text-[14px] font-medium text-rose-600">
                Pro Tip: Name your bookmark "Add to NexMind"
              </span>
            </div>
          </div>
        </div>

        <div className="pt-8 text-center">
          <p className="text-[13px] text-muted-foreground italic">
            Note: Ensure you are logged into NexMind on this browser for the
            connector to work.
          </p>
        </div>
      </div>
    </div>
  );
}
