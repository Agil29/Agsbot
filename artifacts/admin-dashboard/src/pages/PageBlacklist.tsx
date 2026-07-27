import { useState, useEffect } from "react";
import { ShieldOff, Trash2, RefreshCw, UserX, Plus } from "lucide-react";
import { api } from "@/lib/api";

type BlacklistEntry = {
  telegramId: number;
  reason?: string;
  blockedAt: string;
};

function formatDate(s: string) {
  return new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function PageBlacklist() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [addId, setAddId] = useState("");
  const [addReason, setAddReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  function showMsg(text: string, type: "success" | "error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.blacklist.list();
      setEntries(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const id = parseInt(addId, 10);
    if (isNaN(id)) { showMsg("Telegram ID tidak valid", "error"); return; }
    setAdding(true);
    try {
      await api.blacklist.add(id, addReason || undefined);
      showMsg(`User ${id} berhasil diblokir`);
      setAddId("");
      setAddReason("");
      setShowAdd(false);
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(telegramId: number) {
    if (!confirm(`Buka blokir user ${telegramId}?`)) return;
    try {
      await api.blacklist.remove(telegramId);
      showMsg(`User ${telegramId} berhasil dibuka blokirnya`);
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldOff size={22} className="text-red-600" /> Blacklist User
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {entries.length} user diblokir — tidak bisa menggunakan bot
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
          >
            <Plus size={14} /> Blokir User
          </button>
        </div>
      </div>

      {msg.text && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          msg.type === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}>{msg.text}</div>
      )}

      {showAdd && (
        <div className="bg-white rounded-xl border border-red-200 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <UserX size={16} className="text-red-600" /> Blokir User Baru
          </h2>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telegram ID *</label>
              <input
                required
                type="number"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="w-44 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="123456789"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Alasan (opsional)</label>
              <input
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Contoh: spam, penipuan, chargeback"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {adding ? "Memblokir..." : "Blokir"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Batal
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            Memuat data...
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldOff size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-slate-400">Tidak ada user yang diblokir</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Telegram ID</th>
                <th className="px-4 py-3 text-left font-medium">Alasan</th>
                <th className="px-4 py-3 text-left font-medium">Diblokir Sejak</th>
                <th className="px-4 py-3 text-left font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e, i) => (
                <tr key={e.telegramId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-sm font-medium text-slate-800">
                    {e.telegramId}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.reason ? (
                      <span className="px-2 py-0.5 bg-red-50 border border-red-100 text-red-700 rounded text-xs">
                        {e.reason}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {formatDate(e.blockedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(e.telegramId)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                    >
                      <Trash2 size={11} /> Buka Blokir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
