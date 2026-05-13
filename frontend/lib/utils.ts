import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Scrub common API key patterns from text to prevent leakage in logs/UI.
 */
export function scrubKeys(text: string): string {
  if (!text) return text;
  
  const patterns = [
    /gsk_[a-zA-Z0-9]{20,}/g,          // Groq
    /sk-ant-[a-zA-Z0-9\-]{20,}/g,     // Anthropic
    /sk-or-[a-zA-Z0-9\-]{20,}/g,      // OpenRouter
    /sk-proj-[a-zA-Z0-9\-]{20,}/g,    // OpenAI Project
    /sk-[a-zA-Z0-9]{20,}/g,           // Generic OpenAI
    /AI[a-zA-Z0-9_\-]{30,}/g          // Google
  ];

  let result = text;
  patterns.forEach(pattern => {
    result = result.replace(pattern, "[REDACTED]");
  });
  return result;
}
