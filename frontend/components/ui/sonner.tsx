"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/80 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/50 group-[.toaster]:shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:group-[.toaster]:shadow-[0_8px_30px_rgba(0,0,0,0.3)] group-[.toaster]:rounded-[18px] group-[.toaster]:font-semibold group-[.toaster]:text-[13px] sm:group-[.toaster]:text-[14px] px-4 py-3 sm:px-5 sm:py-4",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:font-medium text-[13px]",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full group-[.toast]:px-4 group-[.toast]:font-bold",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-muted-foreground group-[.toast]:border-border/50 group-[.toast]:rounded-full",
          error:
            "group-[.toaster]:bg-destructive/10 group-[.toaster]:text-destructive group-[.toaster]:border-destructive/20 group-[.toaster]:shadow-[0_8px_30px_rgb(239,68,68,0.12)]",
          success:
            "group-[.toaster]:bg-green-500/10 group-[.toaster]:text-green-600 dark:group-[.toaster]:text-green-400 group-[.toaster]:border-green-500/20 group-[.toaster]:shadow-[0_8px_30px_rgb(34,197,94,0.12)]",
          warning:
            "group-[.toaster]:bg-amber-500/10 group-[.toaster]:text-amber-600 group-[.toaster]:border-amber-500/20",
          info: "group-[.toaster]:bg-primary/10 group-[.toaster]:text-primary group-[.toaster]:border-primary/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
