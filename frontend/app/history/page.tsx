import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HistoryClient } from "./history-client";

export const metadata: Metadata = {
  title: "Study History | GraspMind AI",
  description: "View your study session history and progress over time.",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <HistoryClient userId={user.id} />;
}
