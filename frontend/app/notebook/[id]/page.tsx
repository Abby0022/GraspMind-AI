import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotebookClient } from "./notebook-client";

export const metadata: Metadata = {
  title: "Notebook",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NotebookPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch notebook
  const { data: notebook, error } = await supabase
    .from("notebooks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !notebook) {
    redirect("/dashboard");
  }

  return <NotebookClient notebook={notebook} userId={user.id} />;
}
