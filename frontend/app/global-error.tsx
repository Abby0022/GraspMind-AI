"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen w-full flex-col items-center justify-center p-6 text-center bg-background text-foreground">
          <div className="flex flex-col items-center space-y-4 max-w-md">
            <h2 className="text-3xl font-bold tracking-tight text-red-600 dark:text-red-500">
              Critical Error
            </h2>
            <p className="text-muted-foreground">
              A critical error occurred that broke the application layout.
            </p>
            <p className="text-sm font-mono p-4 bg-muted rounded-md w-full overflow-auto text-left">
              {error.message || "Unknown error"}
            </p>
            <Button onClick={() => reset()} className="mt-4">
              Restart Application
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
