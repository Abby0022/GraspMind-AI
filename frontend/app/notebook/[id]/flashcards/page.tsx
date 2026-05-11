import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FlashcardsClient } from "./flashcards-client";

export const metadata: Metadata = {
  title: "Flashcards | GraspMind AI",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FlashcardsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <FlashcardsClient notebookId={id} userId={user.id} />;
}
