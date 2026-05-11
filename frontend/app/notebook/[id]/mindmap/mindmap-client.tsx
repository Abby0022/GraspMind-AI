"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  Panel,
  useEdgesState,
  useNodesState,
} from "reactflow";
import { toast } from "sonner";
import "reactflow/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft,
  Download,
  Loader2,
  Map,
  RefreshCw,
  Sparkles,
  ZoomIn,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────
interface RawNode {
  id: string;
  label: string;
  group: string;
}
interface RawEdge {
  source: string;
  target: string;
  label: string;
}
interface MapData {
  notebook_title: string;
  nodes: RawNode[];
  edges: RawEdge[];
}

// ── Colour scheme by group ───────────────────────────────────
const GROUP_STYLES: Record<
  string,
  { bg: string; border: string; text: string; size: number }
> = {
  main: { bg: "#111827", border: "#111827", text: "#ffffff", size: 56 },
  concept: { bg: "#ffffff", border: "#111827", text: "#111827", size: 44 },
  detail: { bg: "#f3f4f6", border: "#d1d5db", text: "#374151", size: 36 },
};

// ── Dagre auto-layout ────────────────────────────────────────
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  nodes.forEach((n) =>
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ── Transform API response → ReactFlow nodes/edges ───────────
function buildReactFlowData(data: MapData): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = data.nodes.map((n) => {
    const style = GROUP_STYLES[n.group] ?? GROUP_STYLES.detail;
    return {
      id: n.id,
      data: { label: n.label },
      position: { x: 0, y: 0 }, // dagre will set real positions
      style: {
        background: style.bg,
        border: `2px solid ${style.border}`,
        color: style.text,
        borderRadius: "12px",
        padding: "10px 16px",
        fontSize: `${style.size * 0.23}px`,
        fontWeight:
          n.group === "main" ? 700 : n.group === "concept" ? 600 : 400,
        width: n.group === "main" ? 200 : n.group === "concept" ? 160 : 140,
        textAlign: "center" as const,
        boxShadow:
          n.group === "main"
            ? "0 8px 24px rgba(0,0,0,0.18)"
            : "0 2px 8px rgba(0,0,0,0.08)",
      },
    };
  });

  const rfEdges: Edge[] = data.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 10, fill: "#6b7280" },
    labelBgStyle: { fill: "#f9fafb", fillOpacity: 0.85 },
    style: { stroke: "#9ca3af", strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#9ca3af",
      width: 14,
      height: 14,
    },
    type: "smoothstep",
  }));

  const laid = applyDagreLayout(rfNodes, rfEdges);
  return { nodes: laid, edges: rfEdges };
}

// ── Main Component ───────────────────────────────────────────
export function MindMapClient({
  notebookId,
  isEmbedded,
}: {
  notebookId: string;
  isEmbedded?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"generate" | "view">("generate");
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  async function handleGenerate() {
    setIsLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/notebooks/${notebookId}/mindmap/generate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ detail: "Generation failed" }));
        throw new Error(err.detail || "Generation failed");
      }

      const data: MapData = await res.json();

      if (!data.nodes?.length) throw new Error("No concepts found in sources");

      const { nodes: rfNodes, edges: rfEdges } = buildReactFlowData(data);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setTitle(data.notebook_title);
      setPhase("view");
      toast.success("Mind map generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate mind map");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportPNG() {
    try {
      const el = document.querySelector(".react-flow__renderer") as HTMLElement;
      if (!el) return;
      // Dynamic import to keep bundle lean
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: "#f9fafb",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `${title || "mindmap"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Exported as PNG");
    } catch {
      toast.error("Export failed — try a screenshot instead");
    }
  }

  return (
    <div
      className={`flex flex-col ${isEmbedded ? "h-full w-full" : "h-screen bg-background"}`}
    >
      {/* ── Header ── */}
      {!isEmbedded && (
        <div className="px-4 pt-5 pb-3 shrink-0">
          <header className="h-14 flex items-center justify-between px-5 bg-card rounded-full shadow-sm border border-border max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/notebook/${notebookId}`)}
                className="w-9 h-9 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors border border-border"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Map className="w-3.5 h-3.5 text-green-500" />
                </div>
                <h1 className="text-[15px] font-semibold text-foreground tracking-tight">
                  Mind Map
                </h1>
                {title && (
                  <span className="text-[13px] text-muted-foreground">
                    — {title}
                  </span>
                )}
              </div>
            </div>

            {phase === "view" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPhase("generate");
                    setNodes([]);
                    setEdges([]);
                  }}
                  className="h-8 px-3 rounded-full bg-muted border border-border text-[12px] font-medium text-muted-foreground hover:bg-secondary flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
                <button
                  onClick={handleExportPNG}
                  className="h-8 px-3 rounded-full bg-foreground text-background text-[12px] font-medium flex items-center gap-1.5 hover:bg-foreground/90 transition-colors"
                >
                  <Download className="w-3 h-3" /> Export PNG
                </button>
              </div>
            )}
          </header>
        </div>
      )}

      {/* ── Body ── */}
      <div
        className={`flex-1 overflow-hidden ${isEmbedded ? "" : "px-4 pb-4"}`}
      >
        {/* Generate phase */}
        {phase === "generate" && (
          <div className="h-full flex flex-col items-center justify-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-card shadow-sm border border-border flex items-center justify-center mx-auto mb-4">
                <Map className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-[26px] font-bold text-foreground tracking-tight">
                Build a Mind Map
              </h2>
              <p className="text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                AI will extract key concepts and relationships from your sources
                and visualise them as an interactive concept graph.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="h-14 px-10 rounded-full bg-foreground text-background font-medium text-[15px] flex items-center gap-3 hover:opacity-90 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Extracting
                  Concepts...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-primary-foreground" />{" "}
                  Generate Mind Map
                </>
              )}
            </button>

            <div className="flex items-center gap-6 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-foreground" />
                <span>Central Topic</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-card border-2 border-foreground" />
                <span>Key Concept</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-muted border border-border" />
                <span>Detail</span>
              </div>
            </div>
          </div>
        )}

        {/* ReactFlow canvas */}
        {phase === "view" && (
          <div className="h-full rounded-[24px] overflow-hidden border border-border shadow-sm bg-background animate-in fade-in duration-500">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e5e7eb" gap={24} size={1} />
              <Controls
                className="!shadow-sm !border !border-border !rounded-[16px] !overflow-hidden"
                showInteractive={false}
              />
              <MiniMap
                nodeColor={(n) => {
                  const group =
                    (n.style?.background as string) === "#111827"
                      ? "main"
                      : (n.style?.background as string) === "#ffffff"
                        ? "concept"
                        : "detail";
                  return group === "main"
                    ? "#111827"
                    : group === "concept"
                      ? "#93c5fd"
                      : "#d1d5db";
                }}
                maskColor="rgba(249,250,251,0.8)"
                className="!border !border-border !rounded-[16px] !shadow-sm"
              />
              <Panel position="top-right">
                <div className="flex items-center gap-6 bg-card border border-border rounded-full px-4 py-2 shadow-sm text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-foreground" />
                    <span>Topic</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-card border-2 border-foreground" />
                    <span>Concept</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted border border-border" />
                    <span>Detail</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ZoomIn className="w-3 h-3" />
                    <span>Drag to pan · Scroll to zoom</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        )}
      </div>
    </div>
  );
}
