import { useState, useEffect } from "react";
import { Users, RefreshCw, Edit2, Trash2, Check, X, ShieldOff, ShieldCheck, Search } from "lucide-react";
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
  const [blacklisted, setBlacklisted] = useState<Set<number>>(new Set());
  const [blockingId, setBlockingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredUsers = search.trim()
    ? users.filter((u) => {
        const q = search.trim().toLowerCase();
        return (
          String(u.telegramId).includes(q) ||
          u.firstName.toLowerCase().includes(q) ||
          (u.lastName ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)
        );
      })
    : users;

  async function load() {
    setLoading(true);
    try {
      const [usersRes, blRes] = await Promise.all([
        api.users.list(),
        api.blacklist.list(),
      ]);
      setUsers(usersRes.data ?? []);
      const blSet = new Set<number>((blRes.data ?? []).map((e: any) => Number(e.telegramId)));
      setBlacklisted(blSet);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  }

  async function saveSaldo(telegramId: number) {
    const amount = parseInt(editSaldo, 10);
    if (isNaN(amount)) return;
    setSaving(true);
    try {
      const currentUser = users.find((u) => u.telegramId === telegramId);
      const diff = amount - (currentUser?.saldo ?? 0);
      await api.users.setSaldo(telegramId, diff);
      showMsg("Saldo diperbarui");
      setEditId(null);
      load();
    } catch (e: any) {
      showMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(telegramId: number) {
    if (!confirm("Hapus user ini dari sesi?")) return;
    try {
      await api.users.delete(telegramId);
      showMsg("User dihapus dari sesi");
      load();
    } catch (e: any) {
      showMsg(e.message);
    }
  }

  async function toggleBlacklist(telegramId: number, isBlocked: boolean) {
    const name = users.find((u) => u.telegramId === telegramId)?.firstName ?? String(telegramId);
    if (isBlocked) {
      if (!confirm(`Buka blokir ${name}?`)) return;
    } else {
      const reason = prompt(`Alasan blokir ${name} (opsional):`);
      if (reason === null) return; // user cancelled
      setBlockingId(telegramId);
      try {
        await api.blacklist.add(telegramId, reason || undefined);
        showMsg(`${name} berhasil diblokir`);
        setBlacklisted((prev) => new Set([...prev, telegramId]));
      } catch (e: any) {
        showMsg(e.message);
      } finally {
        setBlockingId(null);
      }
      return;
    }
    setBlockingId(telegramId);
    try {
      await api.blacklist.remove(telegramId);
      showMsg(`${name} berhasil dibuka blokirnya`);
      setBlacklisted((prev) => { const s = new Set(prev); s.delete(telegramId); return s; });
    } catch (e: any) {
      showMsg(e.message);
    } finally {
      setBlockingId(null);
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

      {/* Search box */}
      <div className="mb-4 relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari berdasarkan TG ID, nama, atau username..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">
            {search ? `Hasil pencarian "${search}"` : "Recent Users"}
          </span>
          <span className="text-xs text-slate-400">
            {search
              ? `${filteredUsers.length} dari ${users.length} pengguna`
              : `${users.length} pengguna · ${blacklisted.size} diblokir`}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Memuat data...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {search ? `Tidak ada pengguna dengan "${search}"` : "Belum ada pengguna"}
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
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u, i) => {
                  const blocked = blacklisted.has(u.telegramId);
                  return (
                    <tr key={u.telegramId} className={`hover:bg-slate-50 ${blocked ? "bg-red-50/40" : ""}`}>
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
                        {blocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                            <ShieldOff size={10} /> Diblokir
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                            <ShieldCheck size={10} /> Aktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => { setEditId(u.telegramId); setEditSaldo(String(u.saldo)); }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                          >
                            <Edit2 size={11} /> Edit
                          </button>
                          <button
                            onClick={() => toggleBlacklist(u.telegramId, blocked)}
                            disabled={blockingId === u.telegramId}
                            className={`px-3 py-1.5 text-white rounded text-xs flex items-center gap-1 disabled:opacity-50 ${
                              blocked
                                ? "bg-green-600 hover:bg-green-700"
                                : "bg-red-500 hover:bg-red-600"
                            }`}
                          >
                            {blocked
                              ? <><ShieldCheck size={11} /> Buka</>
                              : <><ShieldOff size={11} /> Blokir</>
                            }
                          </button>
                          <button
                            onClick={() => deleteUser(u.telegramId)}
                            className="px-3 py-1.5 bg-slate-400 text-white rounded text-xs hover:bg-slate-500 flex items-center gap-1"
                          >
                            <Trash2 size={11} /> Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
