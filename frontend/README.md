# GraspMind AI — Frontend

> Next.js 16 frontend for the GraspMind AI study platform. App Router, React 19, Tailwind CSS v4, Zustand, Framer Motion, and full PWA support.

![Next.js 16](https://img.shields.io/badge/Next.js-16.2.4-000000?logo=nextdotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)

---

## Overview

The frontend is a **Next.js 16 App Router** application using **React Server Components** for data fetching and **Client Components** for interactive UI. Authentication state is read from Supabase's server-side cookie helpers (`@supabase/ssr`) in Server Components; all API calls to the FastAPI backend use an `HttpOnly` cookie that the browser sends automatically.

It is configured as a **PWA** (`next-pwa`) so students can install it and access cached content offline.

---

## 📁 Directory Structure

```
frontend/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (ThemeProvider, font, metadata)
│   ├── globals.css             # Tailwind base + CSS custom properties
│   ├── page.tsx                # Public landing page (SSR)
│   ├── manifest.ts             # PWA manifest
│   │
│   ├── (auth)/                 # Unauthenticated route group
│   │   ├── login/page.tsx      # Login form
│   │   └── signup/page.tsx     # Signup form (student / teacher invite code)
│   │
│   ├── auth/                   # Supabase auth callback handler
│   │
│   ├── dashboard/
│   │   ├── page.tsx            # Server component (auth gate)
│   │   └── dashboard-client.tsx # Client: notebook grid, create, delete
│   │
│   ├── notebook/[id]/          # Dynamic notebook route
│   │   └── [id]/page.tsx       # Full study interface: chat, sources, flashcards, quiz
│   │
│   ├── knowledge/
│   │   ├── page.tsx            # Server component (auth gate)
│   │   └── knowledge-client.tsx # Client: interactive knowledge graph
│   │
│   ├── classes/
│   │   └── page.tsx            # Student: enrolled classes + join by invite code
│   │
│   ├── teacher/
│   │   ├── page.tsx            # Teacher portal hub (class list)
│   │   └── classes/[id]/       # Per-class management (roster, assignments, analytics)
│   │
│   ├── history/page.tsx        # Chat session history browser
│   ├── ingest/page.tsx         # Manual ingestion status page
│   ├── settings/page.tsx       # BYOK provider key management
│   ├── notifications/page.tsx  # Full notification list
│   ├── docs/                   # In-app documentation portal
│   ├── error.tsx               # Next.js error boundary
│   └── global-error.tsx        # Root-level error boundary
│
├── components/
│   ├── chat-panel.tsx          # ★ Core component: streaming RAG chat UI
│   ├── nav-bar.tsx             # Sticky top navigation
│   ├── notification-bell.tsx   # Popover notification centre
│   ├── share-modal.tsx         # Share notebook / session link modal
│   ├── mastery-ring.tsx        # SVG mastery progress ring
│   ├── focus-timer.tsx         # Pomodoro-style focus timer
│   ├── scratchpad.tsx          # Persistent side-panel notes
│   ├── theme-provider.tsx      # next-themes wrapper
│   ├── theme-toggle.tsx        # Light / dark mode toggle
│   ├── newsletter-form.tsx     # Landing page newsletter form
│   │
│   ├── teacher/
│   │   ├── class-card.tsx      # Class summary card
│   │   ├── members-table.tsx   # Roster table with section assignment
│   │   ├── assignment-builder.tsx # Create/edit assignment form
│   │   └── analytics-chart.tsx # Recharts analytics dashboard
│   │
│   ├── student/
│   │   └── assessment-guard.tsx # Proctoring: fullscreen + focus-loss detection
│   │
│   ├── docs/                   # Documentation portal components
│   │
│   └── ui/                     # shadcn/ui + Base UI primitives
│       ├── button.tsx, input.tsx, dialog.tsx, etc.
│       └── ...
│
├── lib/
│   ├── api.ts                  # ★ Type-safe API client (fetch wrapper + all type exports)
│   ├── store.ts                # Zustand global store (user, theme, chat state)
│   ├── errors.ts               # ApiError class + extractApiError utility
│   ├── utils.ts                # cn() utility (clsx + tailwind-merge)
│   └── supabase/
│       ├── client.ts           # Browser-side Supabase client
│       └── server.ts           # Server-side Supabase client (cookies)
│
├── public/                     # Static assets
│   ├── grasp.svg               # App logo
│   ├── manifest.json           # PWA manifest
│   └── icons/                  # PWA icon set
│
├── next.config.ts              # Next.js config: PWA, security headers, rewrites
├── package.json
├── tsconfig.json
├── biome.json                  # Biome linter + formatter config
└── vercel.json                 # Vercel deployment config
```

---

## 🧭 Routing Map

| Route | Access | Description |
|---|---|---|
| `/` | Public | Marketing landing page (SSR, shows live notebook count) |
| `/login` | Public | Email + password login |
| `/signup` | Public | Student signup; teacher with invite code |
| `/dashboard` | Auth ✅ | Notebook grid; create, open, delete notebooks |
| `/notebook/[id]` | Auth ✅ | Full study interface per notebook |
| `/knowledge` | Auth ✅ | Cross-notebook knowledge graph |
| `/classes` | Auth ✅ (Student) | Enrolled classes; join by invite code |
| `/teacher` | Auth ✅ (Teacher) | Teacher portal — class list |
| `/teacher/classes/[id]` | Auth ✅ (Teacher) | Roster, assignments, analytics for a class |
| `/history` | Auth ✅ | Browse past chat sessions |
| `/settings` | Auth ✅ | BYOK API key management |
| `/notifications` | Auth ✅ | Full notification list |
| `/docs` | Public | In-app documentation |
| `/ingest` | Auth ✅ | File ingestion status monitor |

---

## 🔑 Core Components

### `components/chat-panel.tsx`
The centrepiece of the study interface. Manages:
- **WebSocket connection** to `/ws/chat/{session_id}` for streaming responses
- **Message history** rendering with `react-markdown` + code syntax highlighting
- **Chat mode selector** — RAG Chat, Quiz Mode, Feynman Mode
- **Model/provider selector** — surfaces BYOK-configured providers
- **Source citations** — inline badges linking retrieved document chunks
- **Scratchpad panel** — side-by-side note taking
- **Focus timer** — Pomodoro timer overlay

### `lib/api.ts`
Centralised, type-safe HTTP client:
- All requests include `credentials: "include"` (sends `HttpOnly` auth cookie automatically)
- Routes prefixed with `/api/v1` via `NEXT_PUBLIC_API_URL`
- Full TypeScript interfaces exported for all API response shapes:
  `ClassListItem`, `ClassDetail`, `Assignment`, `ClassMember`, `Notification`, etc.
- Error handling via `extractApiError()` → typed `ApiError` instances

### `lib/store.ts` (Zustand)
Global client state:
- `user` — authenticated user profile + role
- `notebooks` — list of current user's notebooks
- `activeNotebook` — currently open notebook
- `chatMode` — current chat strategy (rag / quiz / feynman)

### `components/teacher/analytics-chart.tsx`
Recharts-powered analytics dashboard:
- Per-student mastery bar chart
- Assignment completion rate
- Weakest concept tag cloud
- Class-wide average mastery over time

### `components/student/assessment-guard.tsx`
Proctoring component for locked assessments:
- Requests and locks **Fullscreen API**
- Listens for `visibilitychange` + `blur` events (focus loss)
- Reports integrity alerts to `/assignments/submissions/{id}/alert`
- Shows warning overlay on focus loss

---

## 🎨 Design System

### Theming
Uses **CSS custom properties** (defined in `globals.css`) for full dark/light mode support via `next-themes`:

```css
:root {
  --background: ...;
  --foreground: ...;
  --primary: ...;
  --secondary: ...;
  --muted: ...;
  --border: ...;
  /* ... */
}

.dark {
  --background: ...;
  /* ... */
}
```

### Typography
- Primary font: **Inter** (Google Fonts, variable)
- Monospace: **JetBrains Mono** (code blocks)
- Sizing follows a consistent modular scale via Tailwind classes

### Animation
- **Framer Motion** for page transitions and complex animations
- **Tailwind CSS `animate-in`** for entrance animations (`fade-in`, `slide-in-from-bottom`)
- **CSS transitions** for micro-interactions (hover, focus states)

### Component Library
- **shadcn/ui** — opinionated component library built on Radix UI
- **Base UI** — headless primitives for fully custom components
- All components use `class-variance-authority` for variant management and `tailwind-merge` for class deduplication

---

## 🔗 API Integration Pattern

```typescript
// lib/api.ts — centralised client
const api = {
  notebooks: {
    list: () => request<Notebook[]>("/notebooks/"),
    create: (data) => request<Notebook>("/notebooks/", { method: "POST", body: JSON.stringify(data) }),
  },
  // ...
};

// Usage in a Server Component
const notebooks = await api.notebooks.list();

// Usage in a Client Component
const [notebooks, setNotebooks] = useState([]);
useEffect(() => { api.notebooks.list().then(setNotebooks); }, []);
```

### WebSocket (Streaming Chat)
```typescript
// In chat-panel.tsx
const ws = new WebSocket(`${WS_BASE}/ws/chat/${sessionId}`);

ws.onopen = () => {
  ws.send(JSON.stringify({ message, notebook_id: notebookId, mode: chatMode }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "token") appendToken(data.content);
  if (data.type === "done") setSources(data.sources);
};
```

### Error Handling
```typescript
// lib/errors.ts
export class ApiError extends Error {
  constructor(public status: number, public detail: string) { super(detail); }
}

// Automatic in request()
if (!response.ok) {
  throw extractApiError(response.status, await response.json());
}
```

---

## ⚙️ Configuration

### Environment Variables
| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | FastAPI backend URL (e.g. `https://graspmind-api.onrender.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase publishable key |

> Only `NEXT_PUBLIC_` prefixed vars are exposed to the browser. Never put secret keys in frontend env vars.

### Next.js Config (`next.config.ts`)
- **PWA** — `next-pwa` with `dest: "public"`, disabled in development
- **Security Headers** — applied to all routes:
  - `Strict-Transport-Security` (HSTS, 1 year)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
- **API Rewrites** — `/api/v1/:path*` proxied to the FastAPI backend (dev convenience)
- **Image Optimisation** — AVIF + WebP formats, full `deviceSizes` set

---

## 🛠️ Development

### Setup
```bash
cd frontend
npm install
```

### Run (development)
```bash
npm run dev        # Next.js dev server with Turbopack (http://localhost:3000)
```

### Linting & Formatting
```bash
npm run lint       # biome check
npm run format     # biome format --write
```

### Production Build
```bash
npm run build      # Builds + exports PWA assets
npm start          # Runs production server
```

---

## 🚢 Deployment (Vercel)

1. **Import** the repository in [Vercel](https://vercel.com)
2. Set **Root Directory** → `frontend`
3. Add environment variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://graspmind-api.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

4. **Deploy** — Vercel detects Next.js automatically and builds with `npm run build`.

Vercel handles:
- Edge CDN caching of static assets
- ISR (Incremental Static Regeneration) for semi-static pages
- Automatic HTTPS with custom domain support
- Preview deployments for every PR branch

---

## 📦 Dependencies

### Production
| Package | Version | Purpose |
|---|---|---|
| `next` | 16.2.4 | App Router + SSR framework |
| `react` / `react-dom` | 19.2.4 | UI rendering |
| `@supabase/ssr` | ^0.10 | Server-side Supabase client (cookies) |
| `@supabase/supabase-js` | ^2.105 | Client-side Supabase access |
| `zustand` | ^5 | Global state management |
| `framer-motion` | ^12 | Animations |
| `@xyflow/react` | ^12 | Knowledge graph canvas |
| `@dagrejs/dagre` | ^3 | Automatic graph layout |
| `recharts` | ^3 | Analytics charts |
| `react-markdown` | ^10 | Markdown rendering in chat |
| `rehype-highlight` | ^7 | Code syntax highlighting |
| `remark-gfm` | ^4 | GitHub-Flavored Markdown |
| `lucide-react` | ^1 | Icon set |
| `sonner` | ^2 | Toast notifications |
| `zod` | ^4 | Schema validation |
| `next-pwa` | ^5 | PWA service worker |
| `next-themes` | ^0.4 | Dark/light mode |
| `html2canvas` | ^1 | Knowledge graph export to PNG |
| `class-variance-authority` | ^0.7 | Component variant management |
| `clsx` + `tailwind-merge` | — | Safe Tailwind class merging |
| `@base-ui/react` | ^1.4 | Headless UI primitives |
| `shadcn` | ^4.7 | Component scaffolding |

### Development
| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5 | Type checking |
| `tailwindcss` | ^4 | CSS utility framework |
| `@biomejs/biome` | 2.2.0 | Linter + formatter |
| `@tailwindcss/postcss` | ^4 | PostCSS integration |

---

## 🔒 Auth Flow (Frontend Side)

```
1. User fills login form → POST /api/v1/auth/login (via api.auth.login())
2. FastAPI sets HttpOnly cookies (access_token, refresh_token)
3. Browser stores cookies automatically — no localStorage/sessionStorage
4. Server Components read cookies via createClient() from lib/supabase/server.ts
5. Client Components use lib/api.ts with credentials: "include"
6. On 401 → redirect to /login
7. On logout → POST /api/v1/auth/logout → cookies cleared by backend
```

> **Security note:** Auth tokens are never accessible to JavaScript. The `HttpOnly` flag ensures XSS attacks cannot steal tokens.

---

## ♿ Accessibility & Performance

- **Semantic HTML** — proper heading hierarchy, landmark regions, ARIA labels throughout
- **Keyboard navigation** — all interactive elements are focusable and keyboard-operable
- **Reduced motion** — Framer Motion respects `prefers-reduced-motion`
- **Image optimisation** — Next.js `<Image>` with AVIF/WebP + lazy loading
- **Font optimisation** — `next/font` for zero-CLS font loading
- **Bundle splitting** — dynamic imports for heavy components (knowledge graph, charts)
- **PWA caching** — app shell and static assets cached by service worker
