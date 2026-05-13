import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GraspMind AI — AI Study Platform",
    template: "%s | GraspMind AI",
  },
  description:
    "Your personal AI tutor that understands your course materials, remembers what you've studied, and generates targeted study tools.",
  keywords: [
    "AI",
    "study",
    "tutor",
    "RAG",
    "flashcards",
    "quiz",
    "spaced repetition",
  ],
};

import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster 
            position="bottom-right" 
            expand={true} 
            gap={8}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
