import { useState, useEffect } from "react";
import { Settings, Save, RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { api } from "@/lib/api";

type Config = {
  API1_BASE_URL: string;
  API1_KEY: string;
  API2_BASE_URL: string;
  API2_KEY: string;
  SUPPORT_USERNAME: string;
  PAKASIR_SLUG: string;
};

const EMPTY: Config = {
  API1_BASE_URL: "",
  API1_KEY: "",
  API2_BASE_URL: "",
  API2_KEY: "",
  SUPPORT_USERNAME: "Agsstore_29",
  PAKASIR_SLUG: "",
};

export function BotSettings() {
  const [config, setConfig] = useState<Config>({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "success" });

  async function load() {
    setLoading(true);
    try {
      const res = await api.settings.get();
      setConfig({ ...EMPTY, ...res.data });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showMsg(text: string, type: "success" | "error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 4000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.settings.update(config);
      showMsg("Pengaturan berhasil disimpan");
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.packages.refresh();
      showMsg("Paket berhasil di-refresh dari semua API");
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw size={24} className="animate-spin mr-2" /> Memuat pengaturan...
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings size={22} className="text-blue-600" /> Integrasi API
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Konfigurasi koneksi ke API penyedia paket</p>
        </div>
      </div>

      {msg.text && (
        <div className={`mb-5 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${
          msg.type === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}>
          {msg.type === "error" ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* API 1 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            API 1 — AKRAB 1 & CIRCLE
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Base URL</label>
              <input
                type="url"
                value={config.API1_BASE_URL}
                onChange={(e) => setConfig({ ...config, API1_BASE_URL: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://api.provider1.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
              <input
                type="password"
                value={config.API1_KEY === "***" ? "" : config.API1_KEY}
                onChange={(e) => setConfig({ ...config, API1_KEY: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={config.API1_KEY === "***" ? "Sudah tersimpan (kosongkan untuk tidak mengubah)" : "API key..."}
              />
              {config.API1_KEY === "***" && (
                <p className="text-xs text-slate-400 mt-1">API key sudah tersimpan. Isi hanya jika ingin mengubah.</p>
              )}
            </div>
          </div>
        </div>

        {/* API 2 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            API 2 — AKRAB 2
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Base URL</label>
              <input
                type="url"
                value={config.API2_BASE_URL}
                onChange={(e) => setConfig({ ...config, API2_BASE_URL: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://api.provider2.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
              <input
                type="password"
                value={config.API2_KEY === "***" ? "" : config.API2_KEY}
                onChange={(e) => setConfig({ ...config, API2_KEY: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={config.API2_KEY === "***" ? "Sudah tersimpan (kosongkan untuk tidak mengubah)" : "API key..."}
              />
              {config.API2_KEY === "***" && (
                <p className="text-xs text-slate-400 mt-1">API key sudah tersimpan. Isi hanya jika ingin mengubah.</p>
              )}
            </div>
          </div>
        </div>

        {/* General */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Pengaturan Umum</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username Support Telegram</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input
                  value={config.SUPPORT_USERNAME}
                  onChange={(e) => setConfig({ ...config, SUPPORT_USERNAME: e.target.value })}
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Agsstore_29"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Pakasir Slug</label>
              <input
                value={config.PAKASIR_SLUG}
                onChange={(e) => setConfig({ ...config, PAKASIR_SLUG: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ags-store-xl"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Save size={15} /> {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Zap size={15} /> {refreshing ? "Memperbarui..." : "Refresh Semua Paket"}
          </button>
        </div>
      </form>
    </div>
  );
}
