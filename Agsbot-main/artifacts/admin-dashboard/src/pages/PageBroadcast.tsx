import { useState } from "react";
import { Send, Users, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

type BroadcastResult = {
  sent: number;
  failed: number;
  total: number;
};

export function PageBroadcast() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const charCount = message.length;
  const isEmpty = message.trim().length === 0;

  async function handleSend() {
    if (isEmpty || loading) return;
    setLoading(true);
    setResult(null);
    setError("");
    setConfirmed(false);

    try {
      const broadcastFn = api.broadcast as (message: string, parseMode?: string) => Promise<unknown>;
      const data = await broadcastFn(message, "HTML");
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? "Gagal mengirim broadcast");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Send size={22} className="text-blue-500" />
        <div>
          <h1 className="text-xl font-bold text-white">Broadcast Pesan</h1>
          <p className="text-sm text-zinc-400">Kirim pesan ke semua pengguna bot</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-sm text-zinc-300 space-y-1">
          <p>Pesan akan dikirim ke <strong className="text-white">seluruh pengguna</strong> yang terdaftar di bot.</p>
          <p>Mendukung format <strong className="text-white">HTML</strong>: <code className="bg-zinc-700 px-1 rounded">&lt;b&gt;</code>, <code className="bg-zinc-700 px-1 rounded">&lt;i&gt;</code>, <code className="bg-zinc-700 px-1 rounded">&lt;code&gt;</code>, <code className="bg-zinc-700 px-1 rounded">&lt;a href=""&gt;</code></p>
        </div>
      </div>

      {/* Textarea */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3">
        <label className="block text-sm font-medium text-zinc-300">Isi Pesan</label>
        <textarea
          value={message}
          onChange={e => { setMessage(e.target.value); setResult(null); setError(""); setConfirmed(false); }}
          rows={8}
          placeholder="Tulis pesan broadcast di sini...&#10;&#10;Contoh:&#10;&lt;b&gt;🔔 Info Update&lt;/b&gt;&#10;&#10;Harga paket terbaru sudah tersedia. Yuk order sekarang!"
          className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500 font-mono"
        />
        <div className="flex justify-between items-center text-xs text-zinc-500">
          <span>{charCount} karakter</span>
          {charCount > 4096 && <span className="text-red-400">⚠️ Melebihi batas Telegram (4096 karakter)</span>}
        </div>
      </div>

      {/* Confirm checkbox */}
      {!result && !loading && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
          <span className="text-sm text-zinc-300">Saya yakin ingin mengirim pesan ini ke semua pengguna</span>
        </label>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={isEmpty || loading || !confirmed || charCount > 4096}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition
          bg-blue-600 hover:bg-blue-500 text-white
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Mengirim... (mohon tunggu)
          </>
        ) : (
          <>
            <Send size={16} />
            Kirim Broadcast
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center gap-3 text-red-300 text-sm">
          <XCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <CheckCircle2 size={18} />
            Broadcast Selesai
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{result.total}</p>
              <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-1">
                <Users size={12} /> Total User
              </p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{result.sent}</p>
              <p className="text-xs text-zinc-400 mt-1">Terkirim</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{result.failed}</p>
              <p className="text-xs text-zinc-400 mt-1">Gagal</p>
            </div>
          </div>
          {result.failed > 0 && (
            <p className="text-xs text-zinc-400">
              Gagal biasanya terjadi jika user memblokir bot atau akun dihapus.
            </p>
          )}
          <button
            onClick={() => { setMessage(""); setResult(null); setConfirmed(false); }}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Kirim pesan baru
          </button>
        </div>
      )}
    </div>
  );
}
