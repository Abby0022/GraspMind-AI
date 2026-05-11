"use client";

import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

function IngestContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    async function performIngestion() {
      const notebookId = searchParams.get("notebook_id");
      const text = searchParams.get("text");
      const title = searchParams.get("title") || "Web Snippet";

      if (!notebookId || !text) {
        setStatus("error");
        setError("Missing notebook ID or text content.");
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Redirect to login but save the current URL to come back
        const currentUrl = window.location.href;
        router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
        return;
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/sources/ingest-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              title,
              content: text,
            }),
          },
        );

        if (!res.ok) {
          throw new Error(await res.text());
        }

        setStatus("success");
        toast.success("Content ingested successfully!");

        // Auto-close after 2 seconds if it's a popup
        setTimeout(() => {
          if (window.opener) {
            window.close();
          } else {
            router.push(`/notebook/${notebookId}`);
          }
        }, 2000);
      } catch (err: any) {
        console.error(err);
        setStatus("error");
        setError(err.message || "Failed to ingest content.");
      }
    }

    performIngestion();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full space-y-6 animate-in fade-in zoom-in-95 duration-500">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Ingesting Content...
            </h1>
            <p className="text-muted-foreground text-sm">
              Saving your selection to NexMind.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Successfully Saved!
            </h1>
            <p className="text-muted-foreground text-sm">
              The content has been added to your notebook.
            </p>
            <button
              onClick={() =>
                router.push(`/notebook/${searchParams.get("notebook_id")}`)
              }
              className="text-primary text-sm font-medium hover:underline flex items-center justify-center gap-1.5 mx-auto"
            >
              Go to Notebook <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Ingestion Failed
            </h1>
            <p className="text-red-500/80 text-sm bg-red-500/5 p-3 rounded-xl border border-red-500/20">
              {error}
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all"
            >
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IngestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <IngestContent />
    </Suspense>
  );
}
