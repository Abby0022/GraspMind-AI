import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Settings — GraspMind AI",
  description: "Configure your LLM providers and API keys.",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <SettingsClient
      user={{
        id: user.id,
        email: user.email || "",
        name: user.user_metadata?.name || "Student",
        role: user.user_metadata?.role || "student",
      }}
    />
  );
}
