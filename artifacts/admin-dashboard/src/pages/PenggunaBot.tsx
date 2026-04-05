import { useState, useEffect } from "react";
import { Users, RefreshCw, Edit2, Trash2, Check, X } from "lucide-react";
import { api } from "@/lib/api";

type User = {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  uid: number;
  saldo: number;
  regDate: string;
};

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function PenggunaBot() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaldo, setEditSaldo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.users.list();
      setUsers(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveSaldo(telegramId: number) {
    const amount = parseInt(editSaldo, 10);
    if (isNaN(amount)) return;
    setSaving(true);
    try {
      const currentUser = users.find((u) => u.telegramId === telegramId);
      const diff = amount - (currentUser?.saldo ?? 0);
      await api.users.setSaldo(telegramId, diff);
      setMsg("Saldo diperbarui");
      setEditId(null);
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function deleteUser(telegramId: number) {
    if (!confirm("Hapus user ini dari sesi?")) return;
    try {
      await api.users.delete(telegramId);
      setMsg("User dihapus dari sesi");
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setTimeout(() => setMsg(""), 3000);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={22} className="text-blue-600" /> Pengguna Bot
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Kelola semua pengguna bot Telegram</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">{msg}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">Recent Users</span>
          <span className="text-xs text-slate-400">{users.length} pengguna</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Memuat data...
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              Belum ada pengguna
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">UID</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Username</th>
                  <th className="px-4 py-3 text-left font-medium">Balance</th>
                  <th className="px-4 py-3 text-left font-medium">TG ID</th>
                  <th className="px-4 py-3 text-left font-medium">Join Date</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u, i) => (
                  <tr key={u.telegramId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">#{u.uid}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.firstName}{u.lastName ? " " + u.lastName : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.username ? `@${u.username}` : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {editId === u.telegramId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={editSaldo}
                            onChange={(e) => setEditSaldo(e.target.value)}
                            className="w-28 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => saveSaldo(u.telegramId)}
                            disabled={saving}
                            className="p-1 text-green-600 hover:text-green-700"
                          >
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-green-700 font-medium">
                          Rp {u.saldo.toLocaleString("id-ID")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.telegramId}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(u.regDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditId(u.telegramId); setEditSaldo(String(u.saldo)); }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                        <button
                          onClick={() => deleteUser(u.telegramId)}
                          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex items-center gap-1"
                        >
                          <Trash2 size={11} /> Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
