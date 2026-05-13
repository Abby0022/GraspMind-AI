"use client";

import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { AssessmentGuard } from "@/components/student/assessment-guard";
import { api } from "@/lib/api";

interface Question {
  id: string;
  question: string;
  question_type: string;
  options: string[];
  difficulty: string;
  correct_answer?: string;
  explanation?: string;
}

interface QuizResult {
  quiz_id: string;
  score: number;
  correct: number;
  total: number;
  results: {
    question_id: string;
    is_correct: boolean;
    correct_answer: string;
    explanation: string;
    student_answer: string;
  }[];
}

type Phase = "generate" | "quiz" | "results";

export function QuizClient({
  notebookId,
  userId,
  isEmbedded,
  examDate,
  assignmentId,
  isProctored,
  timeLimitMins,
  requireFullscreen,
  submissionId,
}: {
  notebookId: string;
  userId: string;
  isEmbedded?: boolean;
  examDate?: string;
  assignmentId?: string;
  isProctored?: boolean;
  timeLimitMins?: number | null;
  requireFullscreen?: boolean;
  submissionId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("generate");
  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizId, setQuizId] = useState<string>("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<QuizResult | null>(null);
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("mixed");

  const isCramMode = examDate
    ? (new Date(examDate).getTime() - Date.now()) / (1000 * 3600 * 24) <= 7 &&
      new Date(examDate).getTime() - Date.now() > -86400000
    : false;

  async function handleGenerate() {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/quizzes/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            num_questions: numQuestions,
            difficulty: difficulty === "mixed" ? null : difficulty,
          }),
        },
      );

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setQuizId(data.quiz_id);

      // Fetch the quiz questions
      const quizRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/quizzes/${data.quiz_id}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const quiz = await quizRes.json();

      setQuestions(quiz.questions || []);
      setPhase("quiz");
      setCurrentIndex(0);
      setAnswers({});
      toast.success(`Generated ${data.question_count} questions!`);
    } catch (err) {
      toast.error(
        "Failed to generate quiz. Make sure you have processed sources.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    setIsLoading(true);
    try {
      const answerItems = Object.entries(answers).map(
        ([questionId, answer]) => ({
          question_id: questionId,
          student_answer: answer,
          quality: 3, // Default SM-2 quality
        }),
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/quizzes/${quizId}/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ answers: answerItems }),
        },
      );

      if (!res.ok) throw new Error(await res.text());

      const data: QuizResult = await res.json();
      
      // If part of an assignment, update submission
      if (assignmentId) {
        await api.assignments.submit(assignmentId, {
          status: "submitted",
          score: data.score,
        });
      }

      setResults(data);
      setPhase("results");
    } catch (err) {
      toast.error("Failed to submit quiz");
    } finally {
      setIsLoading(false);
    }
  }

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const allAnswered = questions.every((q) => answers[q.id]);

  return (
    <div
      className={`flex flex-col ${isEmbedded ? "h-full w-full" : "min-h-screen bg-background"}`}
    >
      {/* Header */}
      {!isEmbedded && (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/notebook/${notebookId}`)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Brain className="w-5 h-5 text-violet-500" />
                <h1 className="text-lg font-semibold text-foreground">
                  Quiz Mode
                </h1>
              </div>
              {phase === "quiz" && (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground"
                >
                  {currentIndex + 1} / {questions.length}
                </Badge>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={`flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col ${isEmbedded ? "overflow-y-auto" : ""}`}
      >
        {/* Generate Phase */}
        {phase === "generate" && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-card shadow-sm border border-border flex items-center justify-center mx-auto mb-6 relative">
                <Sparkles className="w-8 h-8 text-violet-500" />
                {isCramMode && (
                  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                    CRAM
                  </div>
                )}
              </div>
              <h2 className="text-[28px] font-bold text-foreground tracking-tight">
                Generate a Quiz
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                {isCramMode
                  ? "Cram Mode is active! Your quiz will strictly focus on weak areas and difficult concepts."
                  : "AI will create questions from your uploaded study materials to test your knowledge."}
              </p>
            </div>

            <div className="w-full max-w-md bg-card rounded-[32px] p-8 shadow-sm border border-border">
              <div className="space-y-6">
                <div>
                  <label className="text-[13px] font-semibold text-foreground mb-3 block uppercase tracking-wider">
                    Number of Questions
                  </label>
                  <div className="flex gap-2">
                    {[5, 10, 15, 20].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumQuestions(n)}
                        className={`flex-1 py-3 rounded-[16px] text-[14px] font-medium transition-all ${
                          numQuestions === n
                            ? "bg-primary text-background shadow-md border-transparent"
                            : "bg-muted text-muted-foreground border border-border hover:bg-secondary"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-foreground mb-3 block uppercase tracking-wider">
                    Difficulty
                  </label>
                  <div className="flex gap-2">
                    {["easy", "mixed", "hard"].map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`flex-1 py-3 rounded-[16px] text-[14px] font-medium capitalize transition-all ${
                          difficulty === d
                            ? "bg-primary text-background shadow-md border-transparent"
                            : "bg-muted text-muted-foreground border border-border hover:bg-secondary"
                        }`}
                      >
                        {d}
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
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 text-primary-foreground" />
                      Generate Quiz
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quiz Phase */}
        {phase === "quiz" && currentQuestion && (
          <AssessmentGuard
            submissionId={submissionId || ""}
            isProctored={!!isProctored}
            timeLimitMins={timeLimitMins || null}
            requireFullscreen={!!requireFullscreen}
            onTimeUp={() => {
              toast.warning("Time is up! Submitting your answers.");
              handleSubmit();
            }}
          >
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${((currentIndex + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>

              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-border text-muted-foreground"
                    >
                      {currentQuestion.difficulty}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-border text-muted-foreground"
                    >
                      {currentQuestion.question_type === "mcq"
                        ? "Multiple Choice"
                        : currentQuestion.question_type === "fill_blank"
                          ? "Fill in the Blank"
                          : "Short Answer"}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-medium text-foreground leading-relaxed">
                    {currentQuestion.question}
                  </h3>

                  {/* MCQ Options */}
                  {currentQuestion.question_type === "mcq" &&
                    currentQuestion.options.length > 0 && (
                      <div className="space-y-2">
                        {currentQuestion.options.map((option, i) => {
                          const letter = String.fromCharCode(65 + i);
                          const isSelected =
                            answers[currentQuestion.id] === option;
                          return (
                            <button
                              key={option}
                              onClick={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [currentQuestion.id]: option,
                                }))
                              }
                              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                                isSelected
                                  ? "border-foreground bg-foreground/5 text-foreground font-medium"
                                  : "border-border bg-muted text-foreground hover:border-foreground/20"
                              }`}
                            >
                              <span className="font-mono text-xs mr-3 text-muted-foreground">
                                {letter}
                              </span>
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}

                  {/* Text input for fill_blank and short_answer */}
                  {currentQuestion.question_type !== "mcq" && (
                    <textarea
                      value={answers[currentQuestion.id] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentQuestion.id]: e.target.value,
                        }))
                      }
                      placeholder={
                        currentQuestion.question_type === "fill_blank"
                          ? "Type the missing word(s)..."
                          : "Type your answer..."
                      }
                      rows={3}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-foreground focus:border-foreground/50 focus:outline-none resize-none transition-colors"
                    />
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  className="text-muted-foreground"
                >
                  Previous
                </Button>

                {isLastQuestion ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={!allAnswered || isLoading}
                    className="bg-foreground text-background hover:opacity-90"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Submit Quiz
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="bg-foreground text-background hover:opacity-90"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </AssessmentGuard>
        )}

        {/* Results Phase */}
        {phase === "results" && results && (
          <div className="space-y-8">
            {/* Score card */}
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto">
                <Trophy
                  className={`w-10 h-10 ${
                    results.score >= 80
                      ? "text-yellow-500"
                      : results.score >= 50
                        ? "text-violet-500"
                        : "text-muted-foreground"
                  }`}
                />
              </div>
              <div>
                <h2 className="text-4xl font-bold text-foreground">
                  {results.score}%
                </h2>
                <p className="text-muted-foreground mt-1">
                  {results.correct} of {results.total} correct
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {results.score >= 80
                  ? "Excellent work! You know this material well. 🎉"
                  : results.score >= 50
                    ? "Good effort! Review the missed questions below."
                    : "Keep studying! Review the explanations to improve."}
              </p>
            </div>

            {/* Result details */}
            <div className="space-y-3">
              {results.results.map((r, i) => {
                const q = questions.find((q) => q.id === r.question_id);
                return (
                  <Card
                    key={r.question_id}
                    className={`border ${
                      r.is_correct
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        {r.is_correct ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {q?.question || `Question ${i + 1}`}
                          </p>
                          {!r.is_correct && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-red-400">
                                Your answer: {r.student_answer}
                              </p>
                              <p className="text-xs text-green-400">
                                Correct answer: {r.correct_answer}
                              </p>
                            </div>
                          )}
                          {r.explanation && (
                            <p className="text-xs text-muted-foreground mt-2 italic">
                              {r.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-3 justify-center">
              {!isEmbedded && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/notebook/${notebookId}`)}
                  className="border-border text-foreground"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Notebook
                </Button>
              )}
              <Button
                onClick={() => {
                  setPhase("generate");
                  setResults(null);
                  setQuestions([]);
                  setAnswers({});
                }}
                className="bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                New Quiz
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
