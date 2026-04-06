import { useState, useEffect } from "react";
import { Settings, Save, RefreshCw, CheckCircle, AlertCircle, Zap, CreditCard, Copy, Info } from "lucide-react";
import { api } from "@/lib/api";

type Config = {
  API1_BASE_URL: string;
  API1_KEY: string;
  API2_BASE_URL: string;
  API2_KEY: string;
  SUPPORT_USERNAME: string;
  PAKASIR_SLUG: string;
  PAKASIR_API_KEY: string;
  PAKASIR_WEBHOOK_SECRET: string;
};

const EMPTY: Config = {
  API1_BASE_URL: "",
  API1_KEY: "",
  API2_BASE_URL: "",
  API2_KEY: "",
  SUPPORT_USERNAME: "Agsstore_29",
  PAKASIR_SLUG: "",
  PAKASIR_API_KEY: "",
  PAKASIR_WEBHOOK_SECRET: "",
};

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isSaved = value === "***";
  return (
    <div>
      <input
        type="password"
        value={isSaved ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={isSaved ? "Sudah tersimpan (kosongkan untuk tidak mengubah)" : placeholder}
      />
      {isSaved && (
        <p className="text-xs text-slate-400 mt-1">Sudah tersimpan. Isi hanya jika ingin mengubah.</p>
      )}
    </div>
  );
}

export function BotSettings() {
  const [config, setConfig] = useState<Config>({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, "")}/webhook/pakasir`;

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

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          <p className="text-slate-500 text-sm mt-0.5">Konfigurasi koneksi ke API penyedia paket dan payment</p>
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
        {/* API 1 — DOPU */}
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
              <SecretInput
                value={config.API1_KEY}
                onChange={(v) => setConfig({ ...config, API1_KEY: v })}
                placeholder="API key..."
              />
            </div>
          </div>
        </div>

        {/* API 2 — KHFY */}
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
              <SecretInput
                value={config.API2_KEY}
                onChange={(v) => setConfig({ ...config, API2_KEY: v })}
                placeholder="API key..."
              />
            </div>
          </div>
        </div>

        {/* Pakasir */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <CreditCard size={16} className="text-emerald-600" />
            Pakasir — Payment QRIS
          </h2>
          <p className="text-xs text-slate-400 mb-4">Konfigurasi koneksi ke Pakasir untuk topup saldo via QRIS</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project Slug</label>
              <input
                value={config.PAKASIR_SLUG}
                onChange={(e) => setConfig({ ...config, PAKASIR_SLUG: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ags-store-xl"
              />
              <p className="text-xs text-slate-400 mt-1">Nama project/toko di dashboard Pakasir</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">API Key Pakasir</label>
              <SecretInput
                value={config.PAKASIR_API_KEY}
                onChange={(v) => setConfig({ ...config, PAKASIR_API_KEY: v })}
                placeholder="API key dari dashboard Pakasir..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Webhook Secret</label>
              <SecretInput
                value={config.PAKASIR_WEBHOOK_SECRET}
                onChange={(v) => setConfig({ ...config, PAKASIR_WEBHOOK_SECRET: v })}
                placeholder="Secret untuk verifikasi notifikasi Pakasir..."
              />
              <p className="text-xs text-slate-400 mt-1">Opsional — untuk mengamankan endpoint webhook dari request palsu</p>
            </div>

            {/* Webhook URL info */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-start gap-2 mb-2">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <span className="text-xs font-medium text-slate-700">URL Webhook Pakasir</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Daftarkan URL ini di dashboard Pakasir sebagai callback notifikasi pembayaran:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-700 break-all">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors text-slate-600"
                >
                  <Copy size={12} />
                  {copied ? "Tersalin!" : "Salin"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* General */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Pengaturan Umum</h2>
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
