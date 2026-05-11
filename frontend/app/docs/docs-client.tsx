"use client";

import { ArrowLeft, Book, Code, Copy, Check, Key, Layers, Search, Server, Shield, Zap, Database, Brain, FileText, MessageSquare, GraduationCap, Cpu, Menu, List } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="relative group rounded-xl bg-[#1a1a1a] border border-border/30 overflow-hidden my-4">
      <CopyButton text={code} />
      <pre className="p-4 pr-12 overflow-x-auto text-[13px] font-mono text-[#e0e0e0] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

function Endpoint({ method, path, desc, auth = true }: { method: string; path: string; desc: string; auth?: boolean }) {
  const colors: Record<string, string> = { GET: "text-green-500 bg-green-500/10", POST: "text-blue-500 bg-blue-500/10", DELETE: "text-red-500 bg-red-500/10", PATCH: "text-amber-500 bg-amber-500/10", PUT: "text-purple-500 bg-purple-500/10" };
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-secondary/30 border border-border/50 mb-2">
      <span className={`text-[11px] font-bold px-2 py-1 rounded-md shrink-0 ${colors[method] || "text-foreground bg-secondary"}`}>{method}</span>
      <div className="min-w-0 flex-1">
        <code className="text-[13px] font-mono font-semibold text-foreground">{path}</code>
        <p className="text-[12px] text-muted-foreground mt-0.5">{desc}{!auth && <span className="ml-2 text-amber-500 font-semibold">Public</span>}</p>
      </div>
    </div>
  );
}

// -- Sections Content --------------------------------------------─

function OverviewSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="overview" className="text-3xl font-bold tracking-tight text-foreground mb-4">Overview</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">GraspMind AI is an AI-powered study platform built with a <strong className="text-foreground">FastAPI</strong> backend and <strong className="text-foreground">Next.js</strong> frontend. It uses a Bring Your Own Key (BYOK) architecture, letting you connect your own LLM provider to power chat, quizzes, flashcards, summaries, and knowledge tracking — all grounded in your uploaded study materials via a production-grade RAG pipeline.</p>
      
      <h2 id="key-stats" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Key Stats</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ l: "LLM Providers", v: "15+", i: Zap }, { l: "RAG Stages", v: "6", i: Search }, { l: "Study Tools", v: "5", i: GraduationCap }, { l: "Encryption", v: "AES-256", i: Shield }].map(({ l, v, i: I }) => (
          <div key={l} className="p-5 bg-card border border-border rounded-2xl shadow-sm"><I className="w-5 h-5 text-primary mb-3" /><p className="text-2xl font-bold text-foreground">{v}</p><p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">{l}</p></div>
        ))}
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="architecture" className="text-3xl font-bold tracking-tight text-foreground mb-4">Architecture</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">The backend follows a layered, modular architecture. Each layer has a single responsibility and communicates through well-defined interfaces.</p>
      <div className="space-y-4">
        {[
          { layer: "API Layer", path: "grasp/api/routes/", desc: "FastAPI routers — auth, notebooks, sources, chat, quizzes, flashcards, knowledge, history, providers", icon: Server },
          { layer: "Security Layer", path: "grasp/security/", desc: "JWT auth, AES-256-GCM vault, rate limiting (Redis Lua), RBAC, input/key sanitizers, CORS/CSP/HSTS middleware", icon: Shield },
          { layer: "Provider Layer", path: "grasp/providers/", desc: "BYOK registry (15 providers), per-user resolver with Redis cache, encrypted key storage", icon: Key },
          { layer: "RAG Layer", path: "grasp/rag/", desc: "HyDE rewriting → dense search (Qdrant) → BM25 sparse → RRF fusion → cross-encoder reranking", icon: Search },
          { layer: "Study Layer", path: "grasp/study/", desc: "Quiz generator (MCQ, fill-blank, short answer), flashcard generator (basic, cloze), spaced repetition", icon: GraduationCap },
          { layer: "Memory Layer", path: "grasp/memory/", desc: "3-tier: working memory (session), episodic memory (summaries), semantic memory (knowledge graph)", icon: Brain },
          { layer: "Workers", path: "grasp/workers/", desc: "Document ingestion pipeline: download → parse → chunk → embed → store vectors", icon: Cpu },
        ].map(({ layer, path, desc, icon: I }) => (
          <div key={layer} className="flex items-start gap-4 p-5 bg-card border border-border rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0"><I className="w-5 h-5 text-primary" /></div>
            <div><h4 className="text-[15px] font-bold text-foreground">{layer}</h4><p className="text-[12px] text-muted-foreground font-mono mt-1 bg-secondary/50 inline-block px-1.5 py-0.5 rounded">{path}</p><p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{desc}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProvidersSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="providers" className="text-3xl font-bold tracking-tight text-foreground mb-4">Providers API</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-10">Complete guide to managing LLM provider configurations. The Providers API lets you register, test, and manage API keys for any supported LLM. All key mutations are <strong className="text-foreground">rate-limited</strong>, <strong className="text-foreground">audit-logged</strong>, and keys are <strong className="text-foreground">AES-256-GCM encrypted</strong> before storage.</p>

      <h2 id="quick-start" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Quick Start — 3 Steps</h2>
      <div className="p-6 bg-card border border-border rounded-2xl mb-10">
        <div className="space-y-5">
          <div className="flex items-start gap-4"><span className="text-[12px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shrink-0 mt-0.5">1</span><div><p className="text-[14px] font-semibold text-foreground">Browse the catalog</p><p className="text-[13px] text-muted-foreground mt-1">Call <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">GET /api/v1/providers/catalog</code> to see all 15 providers with their available models and key format hints.</p></div></div>
          <div className="flex items-start gap-4"><span className="text-[12px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shrink-0 mt-0.5">2</span><div><p className="text-[14px] font-semibold text-foreground">Test your key</p><p className="text-[13px] text-muted-foreground mt-1">Call <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">POST /api/v1/providers/user/test</code> with your API key to verify it works before committing.</p></div></div>
          <div className="flex items-start gap-4"><span className="text-[12px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shrink-0 mt-0.5">3</span><div><p className="text-[14px] font-semibold text-foreground">Save your provider</p><p className="text-[13px] text-muted-foreground mt-1">Call <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">POST /api/v1/providers/user</code> to encrypt and store your key. Set <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">is_default: true</code> to make it your primary LLM.</p></div></div>
        </div>
      </div>

      <h2 id="endpoints-reference" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Endpoints Reference</h2>

      <div className="mb-10">
        <h3 id="get-catalog" className="text-lg font-semibold text-foreground mb-3">List Catalog</h3>
        <Endpoint method="GET" path="/api/v1/providers/catalog" desc="List all supported LLM providers — public, no auth required" auth={false} />
        <CodeBlock code={`curl https://your-api.com/api/v1/providers/catalog`} />
        <CodeBlock lang="json" code={`{
  "providers": [
    {
      "slug": "groq",
      "name": "Groq",
      "default_model": "llama-3.3-70b-versatile",
      "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
      "key_required": true,
      "key_hint": "gsk_..."
    }
  ]
}`} />
      </div>

      <div className="mb-10">
        <h3 id="post-test" className="text-lg font-semibold text-foreground mb-3">Test API Key</h3>
        <Endpoint method="POST" path="/api/v1/providers/user/test" desc="Dry-run test — verifies an API key works without saving it" />
        <p className="text-[13px] text-muted-foreground mb-2">Rate limit: <strong className="text-foreground">5 requests/minute</strong>. The key is <strong className="text-foreground">never stored</strong>.</p>
        <CodeBlock code={`curl -X POST https://your-api.com/api/v1/providers/user/test \\
  -H "Authorization: Bearer YOUR_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"provider":"openai","api_key":"sk-proj-abc...","model":"gpt-4o-mini"}'`} />
      </div>

      <div className="mb-10">
        <h3 id="post-save" className="text-lg font-semibold text-foreground mb-3">Save Provider</h3>
        <Endpoint method="POST" path="/api/v1/providers/user" desc="Add or update a provider — full pipeline: validate → test → encrypt → store → audit" />
        <CodeBlock code={`curl -X POST https://your-api.com/api/v1/providers/user \\
  -H "Authorization: Bearer YOUR_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"provider":"google","api_key":"AIzaSy...","model":"gemini-2.0-flash","is_default":true}'`} />
      </div>

      <h2 id="provider-catalog" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Provider Catalog Reference</h2>
      <div className="overflow-x-auto rounded-xl border border-border mb-10 shadow-sm">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            <th className="text-left px-4 py-3 font-bold text-foreground">Provider</th>
            <th className="text-left px-4 py-3 font-bold text-foreground">Slug</th>
            <th className="text-left px-4 py-3 font-bold text-foreground">Default Model</th>
            <th className="text-left px-4 py-3 font-bold text-foreground">Key Format</th>
          </tr></thead>
          <tbody className="divide-y divide-border bg-card">
            {[
              { name: "Groq", slug: "groq", model: "llama-3.3-70b-versatile", key: "gsk_..." },
              { name: "Google Gemini", slug: "google", model: "gemini-2.0-flash", key: "AI..." },
              { name: "OpenAI", slug: "openai", model: "gpt-4o-mini", key: "sk-..." },
              { name: "Anthropic", slug: "anthropic", model: "claude-sonnet-4-20250514", key: "sk-ant-..." },
              { name: "Mistral AI", slug: "mistral", model: "mistral-small-latest", key: "—" },
              { name: "Together AI", slug: "together", model: "Llama-3.3-70B-Instruct-Turbo", key: "—" },
              { name: "OpenRouter", slug: "openrouter", model: "llama-3.3-70b-instruct:free", key: "sk-or-..." },
            ].map(({ name, slug, model, key }) => (
              <tr key={slug} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-2.5 font-medium text-foreground">{name}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{slug}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{model}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{key}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="error-handling" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Error Handling</h2>
      <div className="space-y-3 mb-10">
        {[
          { code: "400", reason: "Unknown provider slug, missing required API key, or key length out of range (10–500 chars)" },
          { code: "401", reason: "Missing or invalid JWT — include Authorization: Bearer YOUR_TOKEN header" },
          { code: "422", reason: "API key test failed — the provider rejected the key (invalid, expired, or insufficient quota)" },
          { code: "429", reason: "Rate limit exceeded — save: 10/min, test: 5/min. Retry-After header indicates wait time" },
          { code: "500", reason: "Key encryption failed — usually means VAULT_MASTER_KEY is not set on the server" },
        ].map(({ code, reason }) => (
          <div key={code} className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
            <span className="text-[12px] font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-md shrink-0">{code}</span>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RagSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="rag-pipeline" className="text-3xl font-bold tracking-tight text-foreground mb-4">RAG Pipeline</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">The Retrieval-Augmented Generation pipeline uses a 6-stage hybrid approach for high-precision, contextually rich responses grounded in user documents.</p>
      
      <div className="space-y-4 mb-8">
        {[
          { n: "1. Ingestion", desc: "Upload → parse (PDF, DOCX, PPTX, images, text) → hierarchical parent-child chunking (128 child / 512 parent tokens) → embed with Gemini Embedding 2 (3072-dim) → store in per-user Qdrant collection" },
          { n: "2. Query Rewriting", desc: "HyDE: LLM generates a hypothetical answer paragraph to bridge the query-document vocabulary gap. Keyword expansion: extracts technical terms, synonyms, and acronyms for BM25." },
          { n: "3. Dense Search", desc: "Query embedded via Gemini (RETRIEVAL_QUERY task type) → cosine similarity in Qdrant with HNSW indexing, filtered by notebook_id." },
          { n: "4. Sparse Search", desc: "BM25 keyword matching over Supabase chunk records for the notebook, using the expanded query terms." },
          { n: "5. RRF Fusion", desc: "Reciprocal Rank Fusion merges dense and sparse rankings with configurable weights (k=60), producing a unified candidate set." },
          { n: "6. Reranking", desc: "Cross-encoder reranker scores query-document pairs for final precision, returning the top-k most relevant contexts for LLM prompting." },
        ].map(({ n, desc }) => (
          <div key={n} className="p-5 bg-card border border-border rounded-2xl">
            <h4 className="text-[15px] font-bold text-foreground mb-2">{n}</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// -- Main Layout ------------------------------------------------

function AuthSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="auth" className="text-3xl font-bold tracking-tight text-foreground mb-4">Authentication</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">Authentication delegates to <strong className="text-foreground">Supabase Auth</strong>. The backend validates JWTs via Supabase's <code className="text-[12px] bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">auth.get_user()</code> API, supporting both HS256 and ES256 signing keys. Tokens are stored in <strong className="text-foreground">HttpOnly, Secure, SameSite cookies</strong> — never exposed to client-side JavaScript.</p>
      
      <h2 id="auth-endpoints" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Endpoints</h2>
      <div className="mb-8">
        <Endpoint method="POST" path="/api/v1/auth/signup" desc="Register a new student account" auth={false} />
        <Endpoint method="POST" path="/api/v1/auth/login" desc="Authenticate with email/password, receive HttpOnly cookies" auth={false} />
        <Endpoint method="POST" path="/api/v1/auth/refresh" desc="Refresh access token using a valid refresh token" auth={false} />
        <Endpoint method="POST" path="/api/v1/auth/logout" desc="Sign out — clear cookies and invalidate Supabase session" />
        <Endpoint method="GET" path="/api/v1/auth/me" desc="Return the current authenticated user's profile" />
      </div>

      <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-[13px] text-amber-600 dark:text-amber-400">
        <strong className="font-bold text-[14px] block mb-1">RBAC System</strong> Role hierarchy is <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">student → teacher → admin</code>. Routes can require a minimum role via <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">require_teacher</code> / <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">require_admin</code> FastAPI dependencies.
      </div>
    </section>
  );
}

function ByokSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="byok" className="text-3xl font-bold tracking-tight text-foreground mb-4">BYOK System</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">The Bring Your Own Key architecture ensures users control their own LLM credentials. Keys are encrypted at rest with <strong className="text-foreground">AES-256-GCM</strong> and only decrypted in-memory during API calls.</p>
      
      <h2 id="lifecycle" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Lifecycle</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { step: "1", title: "Validate", desc: "Provider slug, key format, and length (10–500 chars) are verified" },
          { step: "2", title: "Test", desc: "A tiny completion call ('Say hello') verifies the key works" },
          { step: "3", title: "Encrypt", desc: "AES-256-GCM with a random 96-bit nonce, stored as base64" },
          { step: "4", title: "Store", desc: "Encrypted blob saved to Supabase; plaintext wiped from memory" },
        ].map(({ step, title, desc }) => (
          <div key={step} className="p-5 bg-card border border-border rounded-2xl">
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md">Step {step}</span>
            <h4 className="text-[15px] font-bold text-foreground mt-3 mb-1">{title}</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
      
      <h2 id="resolution-order" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Resolution Order</h2>
      <p className="text-[14px] text-muted-foreground mb-4">When an LLM call is made, the resolver checks credentials in order:</p>
      <ol className="list-decimal list-inside text-[14px] text-muted-foreground space-y-2 mb-8 ml-2">
        <li><strong className="text-foreground">Redis cache</strong> — encrypted config with 5-min TTL</li>
        <li><strong className="text-foreground">Supabase DB</strong> — <code className="text-[12px] bg-secondary px-1.5 py-0.5 rounded text-foreground font-mono">user_providers</code> table, prefers default provider</li>
        <li><strong className="text-foreground">Server fallback</strong> — global env keys (GROQ_API_KEY / GOOGLE_API_KEY)</li>
      </ol>
      <CodeBlock lang="python" code={`# Vault encryption format (vault.py)
blob = base64( nonce[12 bytes] + ciphertext[...] + GCM_tag[16 bytes] )

# Generate a master key:
python -c "import secrets; print(secrets.token_hex(32))"`} />
    </section>
  );
}

function StudySection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="study-tools" className="text-3xl font-bold tracking-tight text-foreground mb-4">Study Tools</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">AI-generated study tools are grounded in your uploaded materials via the RAG pipeline. All generation uses the user's BYOK-configured LLM.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[
          { title: "Chat", desc: "RAG-powered conversational AI. Hybrid retrieval → prompt building with citations → streaming response. Supports both REST and WebSocket.", icon: MessageSquare, endpoints: "POST /chat, WS /ws/chat" },
          { title: "Quizzes", desc: "MCQ, fill-in-the-blank, and short answer. Adaptive difficulty based on knowledge profile. Cram Mode targets weak concepts.", icon: GraduationCap, endpoints: "POST /quizzes/generate" },
          { title: "Flashcards", desc: "Basic and cloze deletion cards. Exports to Anki (.apkg) and CSV. Integrates with spaced repetition scheduling.", icon: FileText, endpoints: "POST /flashcards/generate" },
          { title: "Summaries & Mind Maps", desc: "Structured summaries (overview, key concepts, terms, takeaways) and knowledge graphs (nodes + edges) generated from source chunks.", icon: Brain, endpoints: "POST /notebooks/{id}/summary/generate" },
        ].map(({ title, desc, icon: I, endpoints }) => (
          <div key={title} className="p-6 bg-card border border-border rounded-2xl">
            <I className="w-6 h-6 text-primary mb-4" />
            <h4 className="text-[16px] font-bold text-foreground mb-2">{title}</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{desc}</p>
            <code className="text-[11px] text-muted-foreground font-mono bg-secondary/50 px-2 py-1 rounded inline-block">{endpoints}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemorySection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="memory-system" className="text-3xl font-bold tracking-tight text-foreground mb-4">Memory System</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">GraspMind AI implements a 3-tier cognitive memory architecture for persistent, cross-session learning awareness.</p>
      <div className="space-y-4">
        {[
          { tier: "Working Memory", store: "In-memory (per session)", desc: "Active chat context window. Holds the current conversation messages and retrieved document chunks. Cleared on session end." },
          { tier: "Episodic Memory", store: "Supabase (episodes table)", desc: "LLM-summarized session records. Captures topics discussed, student understanding level, and follow-up suggestions. Enables 'Last time we discussed...' continuity." },
          { tier: "Semantic Memory", store: "Supabase (knowledge_nodes)", desc: "Persistent knowledge graph tracking concept mastery (mastered → familiar → learning → struggling → unknown). Updated after quiz attempts and chat interactions. Drives adaptive study recommendations." },
        ].map(({ tier, store, desc }) => (
          <div key={tier} className="p-5 bg-card border border-border rounded-2xl flex flex-col items-start">
            <div className="flex items-center gap-3 mb-2"><h4 className="text-[15px] font-bold text-foreground">{tier}</h4><span className="text-[11px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">{store}</span></div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="security" className="text-3xl font-bold tracking-tight text-foreground mb-4">Security</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">Defense-in-depth security architecture protecting user data and credentials across every layer of the stack.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { t: "AES-256-GCM Vault", d: "Fresh random 96-bit nonce per encryption. GCM tag authenticates ciphertext. Master key never leaves server memory." },
          { t: "Key Sanitizer", d: "Regex patterns for 10+ key formats (Groq, OpenAI, Anthropic, xAI, etc.) automatically scrub keys from logs and error messages." },
          { t: "Rate Limiting", d: "Redis-backed sliding window via atomic Lua scripts. Per-user with IP fallback. Configurable per-endpoint (chat: 60/min, upload: 10/min)." },
          { t: "Input Sanitization", d: "HTML stripping via bleach, filename path traversal prevention, text control character removal, length limits." },
          { t: "Security Headers", d: "CSP, HSTS (2 years), X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy." },
          { t: "Row-Level Security", d: "Supabase RLS policies enforce data isolation. Per-request Supabase clients scoped to the user's JWT for automatic policy evaluation." },
        ].map(({ t, d }) => (
          <div key={t} className="p-5 bg-card border border-border rounded-2xl">
            <h4 className="text-[14px] font-bold text-foreground mb-2">{t}</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigSection() {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h1 id="configuration" className="text-3xl font-bold tracking-tight text-foreground mb-4">Configuration</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">All config is loaded from environment variables (or <code className="text-[12px] bg-secondary px-1.5 py-0.5 rounded font-mono text-foreground">.env</code> file) via Pydantic Settings. Required variables:</p>
      
      <h2 id="env-vars" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Environment Variables</h2>
      <div className="space-y-3 mb-10">
        {[
          { cat: "Supabase", vars: "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY" },
          { cat: "Security", vars: "JWT_SECRET, VAULT_MASTER_KEY (64-char hex)" },
          { cat: "Embeddings", vars: "GOOGLE_API_KEY (Gemini Embedding 2)" },
          { cat: "Vector DB", vars: "QDRANT_URL, QDRANT_API_KEY" },
          { cat: "Cache", vars: "REDIS_URL" },
          { cat: "LLM Fallback", vars: "GROQ_API_KEY or GOOGLE_API_KEY (server-level)" },
        ].map(({ cat, vars }) => (
          <div key={cat} className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shrink-0 w-[100px] text-center">{cat}</span>
            <code className="text-[13px] font-mono text-foreground break-all">{vars}</code>
          </div>
        ))}
      </div>
      
      <h2 id="dev-server" className="text-xl font-bold text-foreground mt-10 mb-4 border-b border-border/50 pb-2">Start Dev Server</h2>
      <CodeBlock code={`# Quick start
cd backend
cp .env.example .env  # Fill in your values
uv sync
uv run uvicorn grasp.main:app --reload`} />
    </section>
  );
}

const MENU_GROUPS = [
  {
    title: "Getting Started",
    items: [
      { id: "overview", label: "Overview", icon: Book, component: OverviewSection, toc: [{ id: "overview", label: "Overview" }, { id: "key-stats", label: "Key Stats" }] },
      { id: "config", label: "Configuration", icon: Server, component: ConfigSection, toc: [{ id: "configuration", label: "Configuration" }, { id: "env-vars", label: "Environment Variables" }, { id: "dev-server", label: "Start Dev Server" }] },
    ]
  },
  {
    title: "Core Concepts",
    items: [
      { id: "architecture", label: "Architecture", icon: Layers, component: ArchitectureSection, toc: [{ id: "architecture", label: "Architecture" }] },
      { id: "rag", label: "RAG Pipeline", icon: Search, component: RagSection, toc: [{ id: "rag-pipeline", label: "RAG Pipeline" }] },
      { id: "memory", label: "Memory System", icon: Brain, component: MemorySection, toc: [{ id: "memory-system", label: "Memory System" }] },
    ]
  },
  {
    title: "Study Features",
    items: [
      { id: "study", label: "Study Tools", icon: GraduationCap, component: StudySection, toc: [{ id: "study-tools", label: "Study Tools" }] },
    ]
  },
  {
    title: "Security & API",
    items: [
      { id: "auth", label: "Authentication", icon: Shield, component: AuthSection, toc: [{ id: "auth", label: "Authentication" }, { id: "auth-endpoints", label: "Endpoints" }] },
      { id: "byok", label: "BYOK System", icon: Key, component: ByokSection, toc: [{ id: "byok", label: "BYOK System" }, { id: "lifecycle", label: "Lifecycle" }, { id: "resolution-order", label: "Resolution Order" }] },
      { id: "providers", label: "Providers API", icon: Zap, component: ProvidersSection, toc: [
        { id: "providers", label: "Providers API" },
        { id: "quick-start", label: "Quick Start" },
        { id: "endpoints-reference", label: "Endpoints Reference" },
        { id: "provider-catalog", label: "Provider Catalog" },
        { id: "error-handling", label: "Error Handling" }
      ]},
      { id: "security", label: "Security", icon: Shield, component: SecuritySection, toc: [{ id: "security", label: "Security" }] },
    ]
  }
];

export function DocsClient() {
  const router = useRouter();
  const [activeId, setActiveId] = useState("providers");
  const [activeTab, setActiveTab] = useState("Integrations");

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Find active component and TOC
  let ActiveComponent = OverviewSection;
  let activeToc: {id: string, label: string}[] = [];
  
  for (const group of MENU_GROUPS) {
    const item = group.items.find(i => i.id === activeId);
    if (item) {
      ActiveComponent = item.component;
      activeToc = item.toc;
      break;
    }
  }

  const scrollTo = (id: string) => { 
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); 
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* -- Top Navigation -- */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/settings")} className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap">
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to App</span>
            </button>
            <div className="h-4 w-px bg-border/50 hidden sm:block" />
            <div className="flex items-center gap-2 sm:hidden">
              <Book className="w-4 h-4 text-primary" />
              <span className="text-[14px] font-bold tracking-tight">GraspMind AI Docs</span>
            </div>
          </div>
          
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="lg:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* -- Main Layout Grid -- */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 lg:py-10 flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
        
        {/* Left Sidebar (Main Nav) */}
        <aside className={`${mobileMenuOpen ? "block" : "hidden"} lg:block w-full lg:w-[240px] shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar pb-6 lg:pb-10 border-b lg:border-none border-border/50 lg:mb-0`}>
          <div className="space-y-8">
            {MENU_GROUPS.map((group) => (
              <div key={group.title}>
                <h4 className="text-[11px] font-bold text-foreground mb-3 uppercase tracking-wider pl-3">{group.title}</h4>
                <nav className="space-y-0.5">
                  {group.items.map((item) => (
                    <button key={item.id} onClick={() => { setActiveId(item.id); setMobileMenuOpen(false); window.scrollTo(0,0); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-[13px] font-medium transition-all text-left ${activeId === item.id ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
                      <item.icon className={`w-4 h-4 shrink-0 ${activeId === item.id ? "text-primary" : "opacity-70"}`} />
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* Center Content */}
        <main className={`flex-1 min-w-0 max-w-3xl w-full ${mobileMenuOpen ? "hidden lg:block" : "block"}`}>
          <ActiveComponent />
        </main>

        {/* Right Sidebar (On this page TOC) */}
        <aside className="hidden xl:block w-[200px] shrink-0 sticky top-24">
          <div className="border-l border-border/50 pl-4">
            <h4 className="text-[12px] font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
              <List className="w-3.5 h-3.5 opacity-50" /> On this page
            </h4>
            <nav className="space-y-2.5">
              {activeToc.map(item => (
                <button key={item.id} onClick={() => scrollTo(item.id)}
                  className="text-[12px] font-medium text-muted-foreground hover:text-foreground text-left block w-full transition-colors">
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

      </div>
    </div>
  );
}
