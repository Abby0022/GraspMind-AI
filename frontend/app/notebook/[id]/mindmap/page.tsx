import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MindMapClient } from "./mindmap-client";

export const metadata: Metadata = {
  title: "Mind Map | GraspMind AI",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MindMapPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <MindMapClient notebookId={id} />;
}
