"use client";

import {
  AlertCircle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Plus,
  Settings2,
  Shield,
  Trash2,
  Zap,
  Download,
  Fingerprint,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NavBar } from "@/components/nav-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface CatalogProvider {
  slug: string;
  name: string;
  default_model: string;
  models: string[];
  key_required: boolean;
  key_hint: string;
}

interface UserProvider {
  provider: string;
  provider_name: string;
  model: string;
  base_url: string;
  api_key_masked: string;
  is_active: boolean;
  is_default: boolean;
  temperature: number;
  max_tokens: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function SettingsClient({ user }: { user: User }) {
  const router = useRouter();
  const supabase = createClient();

  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [userProviders, setUserProviders] = useState<UserProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Configure modal state
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] =
    useState<CatalogProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function loadData() {
    try {
      const token = await getToken();
      const [catalogRes, userRes] = await Promise.all([
        fetch(`${API}/api/v1/providers/catalog`),
        fetch(`${API}/api/v1/providers/user`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const catalogData = await catalogRes.json();
      const userData = await userRes.json();
      setCatalog(catalogData.providers || []);
      setUserProviders(userData.providers || []);
    } catch (e) {
      console.error("Failed to load providers:", e);
    } finally {
      setIsLoading(false);
    }
  }

  function openConfigure(provider: CatalogProvider, existing?: UserProvider) {
    setSelectedProvider(provider);
    setApiKey("");
    setModel(existing?.model || provider.default_model);
    setCustomUrl(existing?.base_url || "");
    setIsDefault(existing?.is_default || userProviders.length === 0);
    setTemperature(existing?.temperature || 0.7);
    setMaxTokens(existing?.max_tokens || 2048);
    setShowAdvanced(false);
    setShowKey(false);
    setTestResult(null);
    setConfigOpen(true);
  }

  async function handleTest() {
    if (!selectedProvider) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/v1/providers/user/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: selectedProvider.slug,
          api_key: apiKey,
          model: model || selectedProvider.default_model,
          base_url: customUrl,
        }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: "Key verified ✓" });
      } else {
        const err = await res.json();
        setTestResult({ ok: false, msg: err.detail || "Test failed" });
      }
    } catch {
      setTestResult({ ok: false, msg: "Connection failed" });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSetDefault(providerSlug: string) {
    try {
      const token = await getToken();
      const up = userProviders.find(p => p.provider === providerSlug);
      if (!up) return;

      const res = await fetch(`${API}/api/v1/providers/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: up.provider,
          api_key: "", // Backend handles empty key as "don't update key"
          model: up.model,
          base_url: up.base_url,
          is_default: true,
          temperature: up.temperature,
          max_tokens: up.max_tokens,
        }),
      });
      if (res.ok) {
        toast.success(`${up.provider_name} set as default`);
        loadData();
      }
    } catch (e) {
      toast.error("Failed to set default");
    }
  }

  async function handleSave() {
    if (!selectedProvider) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/v1/providers/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: selectedProvider.slug,
          api_key: apiKey,
          model: model || selectedProvider.default_model,
          base_url: customUrl,
          is_default: isDefault,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Save failed");
      }
      toast.success(`${selectedProvider.name} configured`);
      setConfigOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(provider: string) {
    try {
      const token = await getToken();
      await fetch(`${API}/api/v1/providers/user/${provider}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Provider removed");
      loadData();
    } catch {
      toast.error("Failed to remove provider");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleExportData() {
    setIsExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/v1/compliance/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GraspMind_Export_${user.id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Academic records exported successfully");
    } catch (err) {
      toast.error("Failed to export data");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleRequestDeletion() {
    setIsDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/v1/compliance/deletion-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Deletion request failed");
      
      toast.success("Deletion scheduled. You have 30 days to cancel.");
      setDeleteConfirmOpen(false);
    } catch (err) {
      toast.error("Failed to process deletion request");
    } finally {
      setIsDeleting(false);
    }
  }

  const configuredSlugs = new Set(userProviders.map((p) => p.provider));

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={handleLogout} />

      <main className="max-w-6xl mx-auto px-5 pt-24 pb-16">
        {/* -- Header -- */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your AI providers and application preferences.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">

          {/* -- LEFT: Providers -- */}
          <div className="space-y-10">

            {/* Active Providers */}
            {userProviders.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Your Providers
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {userProviders.map((up) => {
                    const spec = catalog.find(c => c.slug === up.provider);
                    return (
                      <div
                        key={up.provider}
                        className="group relative flex flex-col p-5 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-lg transition-all"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                            <Key className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex items-center gap-2">
                            {up.is_default ? (
                              <div className="flex items-center gap-1.5 bg-primary text-background px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                <Zap className="w-3 h-3 fill-current" />
                                Default
                              </div>
                            ) : (
                              <button
                                onClick={() => handleSetDefault(up.provider)}
                                className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full border border-border hover:border-foreground/20"
                              >
                                Set Default
                              </button>
                            )}
                            <div className="flex items-center">
                              <button
                                onClick={() => spec && openConfigure(spec, up)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title="Edit Configuration"
                              >
                                <Settings2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(up.provider)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Remove Provider"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-base font-bold text-foreground">
                              {up.provider_name}
                            </h3>
                            <div className={`w-2 h-2 rounded-full ${up.last_error ? 'bg-destructive animate-pulse' : 'bg-green-500'}`} />
                          </div>
                          <p className="text-[12px] text-muted-foreground mb-3 truncate">
                            {up.model} · Temp: {up.temperature}
                          </p>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-medium p-2.5 rounded-lg bg-secondary/50 border border-border/50">
                              <span className="text-muted-foreground">API Key</span>
                              <span className="text-foreground font-mono">{up.api_key_masked || "No key configured"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-medium px-1 text-muted-foreground">
                              <span>Last used</span>
                              <span>{formatDate(up.last_used_at)}</span>
                            </div>
                          </div>

                          {up.last_error && (
                            <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-[11px] font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{up.last_error}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Provider Catalog */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Available Providers
                </h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {catalog.map((cp) => {
                    const isConfigured = configuredSlugs.has(cp.slug);
                    return (
                      <button
                        key={cp.slug}
                        onClick={() => openConfigure(cp)}
                        className="group flex flex-col text-left p-5 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between w-full mb-4">
                          <div className="w-10 h-10 rounded-xl bg-secondary group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                            <Zap className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          {isConfigured && (
                            <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            </div>
                          )}
                        </div>
                        <div className="mt-auto w-full">
                          <h3 className="text-[15px] font-bold text-foreground mb-1">
                            {cp.name}
                          </h3>
                          <p className="text-[12px] text-muted-foreground line-clamp-2">
                            {cp.default_model}
                            {cp.key_hint ? ` · Requires ${cp.key_hint}` : ""}
                          </p>
                        </div>
                        <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="w-4 h-4 text-primary" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* -- RIGHT: Sidebar -- */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield className="w-16 h-16 text-primary" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">BYOK Security</h3>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
                Bring Your Own Key architecture ensures that your credentials are never exposed.
                All keys are encrypted at rest and only decrypted securely in-memory during API calls.
              </p>
              <div className="space-y-2">
                {[
                  "AES-256-GCM Encryption",
                  "Zero-knowledge storage",
                  "Secure Vault isolation"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-[11px] font-medium text-foreground bg-secondary/30 px-2.5 py-1.5 rounded-lg border border-border/50">
                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">Help & Support</h3>
              </div>
              <p className="text-[12px] text-muted-foreground mb-4">
                Having trouble? Check the docs for key format requirements and common provider errors.
              </p>
              <button
                onClick={() => router.push("/docs")}
                className="w-full h-9 rounded-full bg-secondary text-[12px] font-semibold text-foreground hover:bg-secondary/70 transition-colors"
              >
                View Documentation
              </button>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Fingerprint className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-foreground">Compliance & Privacy</h3>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center gap-3 text-left">
                    <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Portable Records</p>
                      <p className="text-[10px] text-muted-foreground">Download all your data (ZIP)</p>
                    </div>
                  </div>
                  {isExporting && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </button>

                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-all text-left group"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                  <div>
                    <p className="text-[11px] font-bold text-destructive">Delete Account</p>
                    <p className="text-[10px] text-destructive/70">GDPR Right to be Forgotten</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* -- Configure Dialog ------------------------------ */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-[24px] p-0 overflow-hidden border-border/50 shadow-2xl bg-card">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {selectedProvider?.name || "Configure Provider"}
              </DialogTitle>
              <DialogDescription className="text-[13px] mt-1.5 text-muted-foreground">
                {selectedProvider?.key_required
                  ? "Enter your API key to connect."
                  : "Configure your connection."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {/* API Key */}
            {selectedProvider?.key_required && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                    API Key
                    {userProviders.find(p => p.provider === selectedProvider?.slug) && (
                      <Shield className="w-3 h-3 text-green-500" />
                    )}
                  </label>
                  {userProviders.find(p => p.provider === selectedProvider?.slug) && (
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter bg-green-500/10 px-1.5 py-0.5 rounded">Securely Saved</span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={
                      userProviders.find(p => p.provider === selectedProvider?.slug)?.api_key_masked ||
                      selectedProvider?.key_hint ||
                      "Enter API key"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-11 rounded-full text-[13px] pr-12 font-mono bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {userProviders.some(p => p.provider === selectedProvider?.slug) && (
                  <p className="text-[11px] text-muted-foreground ml-1">
                    {apiKey ? "New key will replace existing one." : "Leave blank to keep your current encrypted key."}
                  </p>
                )}
              </div>
            )}

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">
                Model
              </label>
              {selectedProvider && selectedProvider.models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full h-11 rounded-full bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 px-4 text-[13px] text-foreground outline-none shadow-none transition-all appearance-none cursor-pointer"
                >
                  {selectedProvider.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  placeholder="Model name"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-11 rounded-full text-[13px] bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                />
              )}
            </div>

            {/* Advanced Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-primary hover:opacity-80 transition-opacity"
            >
              {showAdvanced ? "Hide" : "Show"} Advanced Customization
            </button>

            {showAdvanced && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Temperature */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-semibold text-foreground">
                      Temperature
                    </label>
                    <span className="text-[12px] font-mono font-bold text-primary">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground px-1 font-medium uppercase tracking-wider">
                    <span>Strict</span>
                    <span>Creative</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-foreground">
                    Max Tokens
                  </label>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="h-11 rounded-full text-[13px] bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                  />
                </div>
              </div>
            )}

            {/* Custom URL (only for custom/ollama) */}
            {(selectedProvider?.slug === "custom" ||
              selectedProvider?.slug === "ollama") && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-foreground">
                    Base URL
                  </label>
                  <Input
                    placeholder="http://localhost:11434"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="h-11 rounded-full text-[13px] font-mono bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-foreground/20 focus:bg-background focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-none transition-all outline-none"
                  />
                </div>
              )}

            {/* Default toggle */}
            <div className="flex flex-col gap-1 mt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  disabled={userProviders.find(p => p.provider === selectedProvider?.slug)?.is_default}
                  className="rounded border-border/50 text-foreground focus:ring-foreground disabled:opacity-50"
                />
                <span className="text-[13px] font-medium text-foreground group-has-[:disabled]:text-muted-foreground">
                  Set as default provider
                </span>
                {userProviders.find(p => p.provider === selectedProvider?.slug)?.is_default && (
                  <span className="text-[10px] text-muted-foreground italic">(Current Default)</span>
                )}
              </label>
              {!isDefault && (
                <p className="text-[10px] text-muted-foreground ml-6">
                  Only one provider can be the default. This will unset your previous selection.
                </p>
              )}
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium ${testResult.ok
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                  }`}
              >
                {testResult.ok ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {testResult.msg}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-secondary/30 border-t border-border/50 flex items-center justify-between gap-2">
            {/* Test button */}
            <button
              type="button"
              onClick={handleTest}
              disabled={
                isTesting ||
                (selectedProvider?.key_required === true && !apiKey && !userProviders.some(p => p.provider === selectedProvider?.slug))
              }
              className="h-10 px-4 rounded-full border border-border/50 bg-background text-[13px] font-semibold text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-500" />
              )}
              Test
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="h-10 px-4 rounded-full text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  isSaving ||
                  (selectedProvider?.key_required === true && !apiKey && !userProviders.some(p => p.provider === selectedProvider?.slug))
                }
                className="h-10 px-6 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirmation Dialog -- */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-[32px] p-8 bg-card border-border/50">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-2">
              <Trash2 className="w-8 h-8 text-destructive" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-center">
                Delete your account?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground text-center">
                This will schedule your account for permanent deletion. You will have 
                <strong className="text-foreground"> 30 days </strong> to cancel this 
                request before your data is purged as per GDPR regulations.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-4 flex flex-col gap-2">
              <button
                onClick={handleRequestDeletion}
                disabled={isDeleting}
                className="h-12 w-full rounded-full bg-destructive text-white font-bold text-[14px] hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Request Permanent Deletion"}
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-12 w-full rounded-full bg-secondary text-foreground font-semibold text-[14px] hover:bg-muted transition-all"
              >
                Keep My Account
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

