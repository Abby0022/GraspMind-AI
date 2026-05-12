import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-full border border-border bg-secondary/30 px-5 py-2 text-base transition-all outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/50 hover:bg-secondary/50 hover:border-foreground/20 focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/20 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10 md:text-sm dark:bg-white/5 dark:hover:bg-white/10 dark:focus-visible:bg-black/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
