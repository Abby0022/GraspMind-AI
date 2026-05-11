import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeClient } from "./knowledge-client";

export const metadata: Metadata = {
  title: "Knowledge Profile | GraspMind AI",
  description: "View your knowledge mastery levels and study recommendations.",
};

interface Props {
  searchParams: Promise<{ notebookId?: string }>;
}

export default async function KnowledgePage({ searchParams }: Props) {
  const { notebookId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <KnowledgeClient userId={user.id} notebookId={notebookId} />;
}
