"use client";

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  Meh,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface FlashcardData {
  id: string;
  front: string;
  back: string;
  card_type: string;
  tags: string[];
  ease_factor: number;
  interval: number;
}

interface Deck {
  id: string;
  title: string;
  card_count: number;
  cards: FlashcardData[];
}

type Phase = "generate" | "review" | "complete";

export function FlashcardsClient({
  notebookId,
  userId,
  isEmbedded,
  examDate,
  assignmentId,
}: {
  notebookId: string;
  userId: string;
  isEmbedded?: boolean;
  examDate?: string;
  assignmentId?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("generate");
  const [isLoading, setIsLoading] = useState(false);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [numCards, setNumCards] = useState(15);

  const currentCard = deck?.cards[currentIndex];
  const totalCards = deck?.cards.length ?? 0;

  const isCramMode = examDate
    ? (new Date(examDate).getTime() - Date.now()) / (1000 * 3600 * 24) <= 7 &&
      new Date(examDate).getTime() - Date.now() > -86400000
    : false;

  async function handleGenerate() {
    setIsLoading(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/flashcards/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ num_cards: numCards }),
        },
      );

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Fetch the deck
      const deckRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/flashcards/${data.deck_id}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const deckData = await deckRes.json();

      setDeck(deckData);
      setPhase("review");
      setCurrentIndex(0);
      setIsFlipped(false);
      setReviewed(new Set());
      toast.success(`Created ${data.card_count} flashcards!`);
    } catch {
      toast.error("Failed to generate flashcards");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReview(quality: number) {
    if (!currentCard || !deck) return;

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/flashcards/${deck.id}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ card_id: currentCard.id, quality }),
        },
      );
    } catch {
      // Continue even if review fails
    }

    setReviewed((prev) => new Set(prev).add(currentCard.id));

    if (currentIndex < totalCards - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
    } else {
      setPhase("complete");
    }
  }

  async function handleExport(format: string) {
    if (!deck) return;
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/flashcards/${deck.id}/export?format=${format}`,
      "_blank",
    );
  }

  return (
    <div
      className={`flex flex-col items-center ${isEmbedded ? "h-full w-full" : "min-h-screen bg-background"}`}
    >
      {/* Floating Header */}
      {!isEmbedded && (
        <div className="w-full max-w-3xl px-4 pt-6 pb-2 shrink-0">
          <header className="h-16 flex items-center justify-between px-6 bg-card rounded-full shadow-sm border border-border">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/notebook/${notebookId}`)}
                className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors border border-border"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-blue-500" />
                </div>
                <h1 className="text-lg font-semibold text-foreground tracking-tight">
                  Flashcards Studio
                </h1>
              </div>
            </div>
            {phase === "review" && (
              <div className="px-4 py-1.5 rounded-full bg-muted border border-border text-[13px] font-medium text-muted-foreground">
                {currentIndex + 1}{" "}
                <span className="text-muted-foreground mx-1">/</span>{" "}
                {totalCards}
              </div>
            )}
          </header>
        </div>
      )}

      <main
        className={`flex-1 w-full max-w-3xl px-4 py-8 flex flex-col ${isEmbedded ? "overflow-y-auto" : ""}`}
      >
        {/* -- Generate Phase ------------------------------------------------------------ */}
        {phase === "generate" && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-card shadow-sm border border-border flex items-center justify-center mx-auto mb-6 relative">
                <Layers className="w-8 h-8 text-blue-500" />
                {isCramMode && (
                  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                    CRAM
                  </div>
                )}
              </div>
              <h2 className="text-[28px] font-bold text-foreground tracking-tight">
                Generate Flashcards
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                {isCramMode
                  ? "Cram Mode is active! We'll prioritize the concepts you're struggling with the most to prepare for your exam."
                  : "Our AI will analyze your notebook sources and create a custom spaced-repetition deck to help you master the material."}
              </p>
            </div>

            <div className="w-full max-w-md bg-card rounded-[32px] p-8 shadow-sm border border-border">
              <div className="space-y-6">
                <div>
                  <label className="text-[13px] font-semibold text-foreground mb-3 block uppercase tracking-wider">
                    Number of Cards
                  </label>
                  <div className="flex gap-2">
                    {[10, 15, 20, 30].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumCards(n)}
                        className={`flex-1 py-3 rounded-[16px] text-[14px] font-medium transition-all ${
                          numCards === n
                            ? "bg-primary text-background shadow-md border-transparent"
                            : "bg-muted text-muted-foreground border border-border hover:bg-secondary"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="w-full h-14 rounded-full bg-foreground text-background font-medium text-[15px] flex items-center justify-center transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleGenerate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />{" "}
                      Analyzing Sources...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 text-primary-foreground" />{" "}
                      Generate Deck
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -- Review Phase -------------------------------------------------------------- */}
        {phase === "review" && currentCard && (
          <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
            {/* Progress bar */}
            <div className="w-full max-w-md bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
              />
            </div>

            {/* Flashcard with flip */}
            <div
              className="relative w-full aspect-[4/3] max-h-[450px] perspective-1000 cursor-pointer group"
              onClick={() => setIsFlipped(!isFlipped)}
              style={{ perspective: "1500px" }}
            >
              <div
                className="relative w-full h-full transition-transform duration-700 ease-in-out"
                style={{
                  transformStyle: "preserve-3d",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 w-full h-full rounded-[32px] bg-card border border-border shadow-lg flex flex-col p-10 hover:border-foreground/20 transition-colors"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="w-fit px-3 py-1 rounded-full bg-secondary text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-auto">
                    {currentCard.card_type === "cloze"
                      ? "Fill in blank"
                      : "Question"}
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[22px] font-medium text-foreground text-center leading-relaxed">
                      {currentCard.front}
                    </p>
                  </div>
                  <div className="mt-auto text-center">
                    <p className="text-[13px] text-muted-foreground font-medium flex items-center justify-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5" /> Tap to reveal answer
                    </p>
                  </div>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 w-full h-full rounded-[32px] bg-muted border-2 border-primary shadow-xl flex flex-col p-10"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="w-fit px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[11px] font-bold uppercase tracking-wider mb-auto">
                    Answer
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[22px] font-medium text-foreground text-center leading-relaxed">
                      {currentCard.back}
                    </p>
                  </div>

                  {currentCard.tags.length > 0 && (
                    <div className="mt-auto flex justify-center gap-2 flex-wrap">
                      {currentCard.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 rounded-full bg-card border border-border text-[11px] font-medium text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Review buttons (show after flip) */}
            <div
              className={`w-full max-w-md transition-all duration-500 transform ${isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
            >
              <p className="text-[13px] font-medium text-center text-muted-foreground mb-4">
                How well did you know this?
              </p>
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReview(1);
                  }}
                  className="flex flex-col items-center gap-2 py-4 rounded-[20px] bg-card border border-border text-red-500 hover:bg-red-500/10 hover:border-red-500 transition-all shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-500/10 group-hover:bg-card flex items-center justify-center transition-colors">
                    <ThumbsDown className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] font-semibold">Again</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReview(3);
                  }}
                  className="flex flex-col items-center gap-2 py-4 rounded-[20px] bg-card border border-border text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500 transition-all shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-full bg-yellow-500/10 group-hover:bg-card flex items-center justify-center transition-colors">
                    <Meh className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] font-semibold">Hard</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReview(4);
                  }}
                  className="flex flex-col items-center gap-2 py-4 rounded-[20px] bg-card border border-border text-green-500 hover:bg-green-500/10 hover:border-green-500 transition-all shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500/10 group-hover:bg-card flex items-center justify-center transition-colors">
                    <ThumbsUp className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] font-semibold">Good</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReview(5);
                  }}
                  className="flex flex-col items-center gap-2 py-4 rounded-[20px] bg-card border border-border text-blue-500 hover:bg-blue-500/10 hover:border-blue-500 transition-all shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 group-hover:bg-card flex items-center justify-center transition-colors">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="text-[13px] font-semibold">Easy</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -- Complete Phase ------------------------------------------------------------ */}
        {phase === "complete" && deck && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-[32px] font-bold text-foreground tracking-tight">
                Deck Complete!
              </h2>
              <p className="text-[16px] text-muted-foreground">
                Awesome job. You reviewed{" "}
                <strong className="text-foreground">{reviewed.size}</strong> of{" "}
                {totalCards} cards.
              </p>
            </div>

            {/* Export options */}
            <div className="w-full max-w-md bg-card rounded-[32px] p-8 shadow-sm border border-border space-y-6">
              <h3 className="text-[15px] font-semibold text-foreground flex items-center justify-center gap-2">
                <Download className="w-4 h-4 text-muted-foreground" />
                Export Deck
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleExport("csv")}
                  className="py-3 rounded-[16px] bg-muted border border-border text-[13px] font-medium text-foreground hover:bg-secondary hover:border-foreground/20 transition-all"
                >
                  CSV
                </button>
                <button
                  onClick={() => handleExport("anki")}
                  className="py-3 rounded-[16px] bg-muted border border-border text-[13px] font-medium text-foreground hover:bg-secondary hover:border-foreground/20 transition-all"
                >
                  Anki
                </button>
                <button
                  onClick={() => handleExport("json")}
                  className="py-3 rounded-[16px] bg-muted border border-border text-[13px] font-medium text-foreground hover:bg-secondary hover:border-foreground/20 transition-all"
                >
                  JSON
                </button>
              </div>
            </div>

            <div className="flex gap-4 justify-center mt-4">
              {!isEmbedded && (
                <button
                  onClick={() => router.push(`/notebook/${notebookId}`)}
                  className="h-12 px-6 rounded-full bg-card border border-border text-foreground font-medium flex items-center gap-2 hover:bg-muted transition-all shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Notebook
                </button>
              )}
              <button
                onClick={() => {
                  setPhase("review");
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setReviewed(new Set());
                }}
                className="h-12 px-8 rounded-full bg-foreground text-background font-medium flex items-center gap-2 hover:opacity-90 hover:shadow-lg transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Review Again
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
