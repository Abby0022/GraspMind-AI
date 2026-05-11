import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your study notebooks and learning overview.",
};

/**
 * Dashboard — Server Component that fetches user data,
 * then delegates rendering to the client component.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardClient
      user={{
        id: user.id,
        email: user.email || "",
        name: user.user_metadata?.name || "Student",
        role: user.user_metadata?.role || "student",
      }}
    />
  );
}
