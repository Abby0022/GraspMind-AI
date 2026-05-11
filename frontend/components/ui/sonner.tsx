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
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-[#202124] group-[.toaster]:border-[#e8eaed] group-[.toaster]:shadow-xl group-[.toaster]:rounded-[24px] group-[.toaster]:font-semibold group-[.toaster]:text-[14px] px-5 py-4",
          description:
            "group-[.toast]:text-[#5f6368] group-[.toast]:font-medium text-[13px]",
          actionButton:
            "group-[.toast]:bg-[#111] group-[.toast]:text-white group-[.toast]:rounded-full",
          cancelButton:
            "group-[.toast]:bg-[#f8f9fa] group-[.toast]:text-[#5f6368] group-[.toast]:border-[#e8eaed] group-[.toast]:rounded-full",
          error:
            "group-[.toaster]:bg-[#fffafa] group-[.toaster]:text-[#ef4444] group-[.toaster]:border-[#fca5a5] group-[.toaster]:shadow-[0_8px_30px_rgb(239,68,68,0.12)]",
          success:
            "group-[.toaster]:bg-[#f0fdf4] group-[.toaster]:text-[#16a34a] group-[.toaster]:border-[#bbf7d0] group-[.toaster]:shadow-[0_8px_30px_rgb(22,163,74,0.12)]",
          warning:
            "group-[.toaster]:bg-[#fffbeb] group-[.toaster]:text-[#d97706] group-[.toaster]:border-[#fde68a]",
          info: "group-[.toaster]:bg-[#f0f9ff] group-[.toaster]:text-[#0284c7] group-[.toaster]:border-[#bae6fd]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
