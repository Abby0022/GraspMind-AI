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
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  function openConfigure(provider: CatalogProvider) {
    setSelectedProvider(provider);
    setApiKey("");
    setModel(provider.default_model);
    setCustomUrl("");
    setIsDefault(userProviders.length === 0);
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

  const configuredSlugs = new Set(userProviders.map((p) => p.provider));

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={user} onLogout={handleLogout} />

      <main className="max-w-6xl mx-auto px-5 pt-24 pb-16">
        {/* ── Header ── */}
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
          
          {/* ── LEFT: Providers ── */}
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
                  {userProviders.map((up) => (
                    <div
                      key={up.provider}
                      className="group relative flex flex-col p-5 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                          <Key className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                          {up.is_default && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-md">
                              Default
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(up.provider)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove Provider"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-auto">
                        <h3 className="text-base font-bold text-foreground mb-1">
                          {up.provider_name}
                        </h3>
                        <p className="text-[12px] text-muted-foreground mb-3 truncate">
                          {up.model}
                        </p>
                        
                        <div className="flex items-center justify-between text-[11px] font-medium p-2.5 rounded-lg bg-secondary/50 border border-border/50">
                          <span className="text-muted-foreground">API Key</span>
                          <span className="text-foreground font-mono">{up.api_key_masked || "No key configured"}</span>
                        </div>
                        
                        {up.last_error && (
                          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-[11px] font-medium">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{up.last_error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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

          {/* ── RIGHT: Sidebar ── */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
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
                  "Decrypted only in memory"
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
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Help & Support</h3>
              </div>
              <p className="text-[12px] text-muted-foreground mb-4">
                Having trouble configuring a provider? Make sure you have created an active API key with sufficient billing quota on the provider's dashboard.
              </p>
              <button 
                onClick={() => window.location.href = "/docs"}
                className="w-full text-center text-[12px] font-semibold text-primary hover:underline"
              >
                View Documentation →
              </button>
            </div>
          </div>
          
        </div>
      </main>

      {/* ── Configure Dialog ────────────────────────────── */}
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
                <label className="text-[13px] font-semibold text-foreground">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={selectedProvider?.key_hint || "Enter API key"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-11 rounded-xl text-[13px] pr-10 font-mono bg-secondary/50 border-transparent hover:border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 shadow-none transition-all"
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
                  className="w-full h-11 rounded-xl bg-secondary/50 border-transparent hover:border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 px-3 text-[13px] text-foreground outline-none shadow-none transition-all"
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
                  className="h-11 rounded-xl text-[13px] bg-secondary/50 border-transparent hover:border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 shadow-none transition-all"
                />
              )}
            </div>

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
                  className="h-11 rounded-xl text-[13px] font-mono bg-secondary/50 border-transparent hover:border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 shadow-none transition-all"
                />
              </div>
            )}

            {/* Default toggle */}
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-border/50 text-foreground focus:ring-foreground"
              />
              <span className="text-[13px] font-medium text-foreground">
                Set as default provider
              </span>
            </label>

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium ${
                  testResult.ok
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
                (selectedProvider?.key_required === true && !apiKey)
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
                  (selectedProvider?.key_required === true && !apiKey)
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
    </div>
  );
}
