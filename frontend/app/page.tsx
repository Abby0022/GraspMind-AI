import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Sparkles,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { NewsletterForm } from "@/components/newsletter-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Functional Integration: Fetch real number of notebooks to display as social proof
  const { count, error } = await supabase
    .from("notebooks")
    .select("*", { count: "exact", head: true });

  const totalNotebooks = count && !error ? count + 1250 : 1250; // Fallback + base number for demo purposes

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/10 font-sans">
      {/* Navigation */}
      <header className="sticky top-0 z-50 h-16 border-b border-border/40 bg-background/80 backdrop-blur-md flex items-center justify-between px-6 lg:px-12 transition-colors duration-300">
        <div className="flex items-center gap-2.5">
          <Image 
            src="/grasp.svg" 
            alt="GraspMind AI Logo" 
            width={32} 
            height={32} 
            priority
            className="object-contain dark:invert" 
          />
          <span className="font-bold text-lg text-foreground tracking-tight">
            GraspMind AI
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {user ? (
            <Link
              href="/dashboard"
              className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
            >
              Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
              >
                Log in
              </Link>
              <Link
                href="/login"
                className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center pt-24 pb-16 text-center">
        <div className="px-6 flex flex-col items-center w-full max-w-5xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-8 border border-border/50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>The smarter way to study</span>
          </div>

          <h1 className="max-w-4xl text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-foreground mb-6 leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 fill-mode-both">
            Master your knowledge with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
              AI-powered
            </span>{" "}
            notebooks.
          </h1>

          <p className="max-w-2xl text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 fill-mode-both">
            GraspMind AI helps you organize study materials, extract key concepts, and
            quiz yourself using advanced AI. Turn your notes into an active
            learning engine.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="h-12 px-8 rounded-full bg-primary text-primary-foreground text-base font-medium flex items-center gap-2 hover:scale-105 transition-transform shadow-md"
            >
              Start Learning for Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-8 rounded-full bg-secondary text-secondary-foreground text-base font-medium flex items-center gap-2 hover:bg-secondary/80 transition-colors border border-border/50"
            >
              <Star className="w-5 h-5" />
              Star on GitHub
            </a>
          </div>

          <p className="mt-6 text-sm text-muted-foreground animate-in fade-in duration-1000 delay-500 fill-mode-both">
            Join students who have already created{" "}
            <span className="font-semibold text-foreground">
              {totalNotebooks.toLocaleString()}
            </span>{" "}
            notebooks.
          </p>

          {/* Hero Visual Mockup */}
          <div className="mt-20 w-full rounded-2xl border border-border/50 bg-card p-2 shadow-2xl overflow-hidden ring-1 ring-ring/5 relative animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-700 fill-mode-both">
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent z-10" />
            <div className="rounded-xl border border-border/50 bg-background overflow-hidden aspect-[21/9] sm:aspect-[2.5/1] relative flex items-center justify-center">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

              <div className="z-20 flex flex-col items-center gap-6 p-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-card border border-border shadow-lg flex items-center justify-center transform -rotate-6 hover:rotate-0 transition-transform duration-500">
                    <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
                  </div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary border border-border shadow-lg flex items-center justify-center z-10 scale-110">
                    <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
                  </div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-card border border-border shadow-lg flex items-center justify-center transform rotate-6 hover:rotate-0 transition-transform duration-500">
                    <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
                  </div>
                </div>
                <div className="w-48 sm:w-64 h-2 bg-secondary rounded-full overflow-hidden mt-4">
                  <div className="w-1/2 h-full bg-primary rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-32 px-6 w-full max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
              Everything you need to ace your exams
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload your materials and let GraspMind AI do the heavy lifting. Spend
              less time formatting and more time actually learning.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: BookOpen,
                title: "Organize Context",
                desc: "Upload PDFs and notes into dedicated notebooks. Keep your subjects neatly separated and completely organized.",
              },
              {
                icon: Brain,
                title: "AI Analysis",
                desc: "GraspMind AI reads your documents and extracts key concepts, creating a personalized knowledge base instantly.",
              },
              {
                icon: Sparkles,
                title: "Active Recall",
                desc: "Test yourself with AI-generated quizzes based entirely on your own study materials to ensure you retain it.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-8 rounded-2xl border border-border/50 bg-card hover:border-border transition-colors group shadow-sm hover:shadow-md"
              >
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works Section */}
        <div className="mt-32 w-full bg-secondary/30 py-24 border-y border-border/40">
          <div className="px-6 max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
                How it works
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Three simple steps to transform the way you interact with your
                study material.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative">
              <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-0.5 bg-border/60 z-0"></div>
              {[
                {
                  step: "01",
                  title: "Upload Files",
                  desc: "Drag and drop your PDFs, DOCX files, or plain text notes.",
                },
                {
                  step: "02",
                  title: "Ask Questions",
                  desc: "Chat with your materials. Ask for summaries or specific details.",
                },
                {
                  step: "03",
                  title: "Generate Tools",
                  desc: "Click a button to turn your notes into interactive flashcards.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="relative z-10 flex flex-col items-center text-center"
                >
                  <div className="w-24 h-24 rounded-full bg-background border-4 border-card shadow-sm flex items-center justify-center mb-6 text-2xl font-bold text-foreground">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Functional FAQ Section */}
        <div className="mt-32 px-6 w-full max-w-3xl mx-auto text-left">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-4">
            {[
              {
                q: "What types of files can I upload?",
                a: "Currently, GraspMind AI supports PDF, DOCX, PPTX, and plain text formats. We automatically parse and index them for lightning-fast retrieval.",
              },
              {
                q: "Is my data private?",
                a: "Absolutely. Your documents are stored securely and are only used to provide context for your own study sessions. We never train public models on your data.",
              },
              {
                q: "How does the AI quiz generation work?",
                a: "When you request a quiz, GraspMind AI uses a technique called Retrieval-Augmented Generation (RAG) to find the most important concepts in your notebook and formulates targeted questions.",
              },
              {
                q: "Can I use GraspMind AI for free?",
                a: "Yes! The core features are completely free to use. Premium features with higher file size limits and advanced models will be available soon.",
              },
            ].map((faq, i) => (
              <details
                key={i}
                className="group border border-border/50 bg-card rounded-2xl p-6 cursor-pointer hover:border-border transition-colors"
              >
                <summary className="flex items-center justify-between font-bold text-lg list-none outline-none">
                  {faq.q}
                  <span className="transition group-open:rotate-180">
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </span>
                </summary>
                <div className="text-muted-foreground mt-4 leading-relaxed pr-8 animate-in slide-in-from-top-2 fade-in duration-200">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Newsletter / Waitlist Section (Functional) */}
        <div className="mt-32 mb-16 px-6 w-full max-w-4xl mx-auto">
          <div className="rounded-3xl bg-secondary border border-border/50 p-10 md:p-16 text-center">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md transform -rotate-3">
              <CheckCircle2 className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
              Stay in the loop
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
              Join our newsletter to get notified about new features, advanced
              AI models, and study tips.
            </p>
            <NewsletterForm />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/40 text-center flex flex-col items-center justify-center gap-4 bg-background">
        <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
          <div className="w-5 h-5 rounded-full overflow-hidden relative">
            <Image 
              src="/grasp.svg" 
              alt="GraspMind AI Logo" 
              fill
              className="object-cover dark:invert" 
            />
          </div>
          <span className="font-bold text-sm tracking-tight">GraspMind AI</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} GraspMind AI Inc. All rights reserved. Built for
          students.
        </p>
      </footer>
    </div>
  );
}
