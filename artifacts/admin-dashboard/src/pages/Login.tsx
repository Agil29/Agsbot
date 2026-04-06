import { useState } from "react";
import { Bot, Lock } from "lucide-react";
import { setStoredKey, api } from "@/lib/api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    setStoredKey(key.trim());
    try {
      await api.stats();
      onLogin();
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED") setError("API Key salah. Coba lagi.");
      else setError("Tidak dapat terhubung ke server.");
      setStoredKey("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(224,71%,16%)]">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-3">
            <Bot size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Agsstorebot Admin</h1>
          <p className="text-slate-500 text-sm mt-1">Masuk dengan API Key admin</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Masukkan API key..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
        <p className="text-xs text-slate-400 text-center mt-4">
          Gunakan <code className="bg-slate-100 px-1 rounded">ADMIN_API_KEY</code> dari environment
        </p>
      </div>
    </div>
  );
}
