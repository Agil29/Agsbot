import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Clock, CheckCircle, XCircle, RefreshCw, Search } from "lucide-react";

type PreOrder = {
  id: string;
  userId: number;
  userName: string;
  sku: string;
  packageName: string;
  nomorTujuan: string;
  price: number;
  paymentMethod: string;
  status: string;
  reffId?: string;
  sn?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:    { label: "⏳ Menunggu Stok", color: "bg-yellow-100 text-yellow-700" },
  processing: { label: "⚙️ Diproses",      color: "bg-blue-100 text-blue-700" },
  done:       { label: "✅ Selesai",        color: "bg-green-100 text-green-700" },
  cancelled:  { label: "❌ Dibatalkan",     color: "bg-red-100 text-red-700" },
  refunded:   { label: "💰 Refunded",       color: "bg-purple-100 text-purple-700" },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function PagePreOrder() {
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<"cancel" | "refund">("cancel");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.request<{ data: PreOrder[] }>("GET", "/pre-orders");
      setOrders(res.data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      o.id.toLowerCase().includes(q) ||
      o.nomorTujuan.includes(q) ||
      o.userName.toLowerCase().includes(q) ||
      o.packageName.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  async function doAction(id: string, type: "cancel" | "refund") {
    setActionLoading(id);
    try {
      const endpoint = type === "cancel"
        ? `/pre-orders/${id}/cancel`
        : `/pre-orders/${id}/refund`;
      await api.request("POST", endpoint, { note: cancelNote || undefined });
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Gagal");
    } finally {
      setActionLoading(null);
      setConfirmId(null);
      setCancelNote("");
    }
  }

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    processing: orders.filter((o) => o.status === "processing").length,
    done: orders.filter((o) => o.status === "done").length,
    cancelled: orders.filter((o) => o.status === "cancelled" || o.status === "refunded").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock size={22} className="text-blue-600" /> PRE ORDER
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Kelola pre-order user — cancel dan refund saldo otomatis</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.all, color: "text-slate-700" },
          { label: "Pending", value: counts.pending, color: "text-yellow-600" },
          { label: "Selesai", value: counts.done, color: "text-green-600" },
          { label: "Dibatalkan", value: counts.cancelled, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari ID, nomor, nama user, paket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Semua Status ({counts.all})</option>
          <option value="pending">Pending ({counts.pending})</option>
          <option value="processing">Diproses ({counts.processing})</option>
          <option value="done">Selesai ({counts.done})</option>
          <option value="cancelled">Dibatalkan</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">Tidak ada pre-order ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["ID / Tanggal", "User", "Paket / Nomor", "Harga", "Bayar", "Status", "Aksi"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => {
                  const st = STATUS_LABEL[o.status] ?? { label: o.status, color: "bg-slate-100 text-slate-600" };
                  const canCancel = o.status === "pending" || o.status === "processing";
                  const canRefund = o.status === "done";
                  return (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-slate-600">{o.id}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{fmtDate(o.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">{o.userName}</div>
                        <div className="text-xs text-slate-400">ID: {o.userId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">{o.packageName}</div>
                        <div className="text-xs text-blue-600 font-mono">{o.nomorTujuan}</div>
                        {o.reffId && <div className="text-xs text-slate-400 mt-0.5">Ref: {o.reffId}</div>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        Rp {o.price.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                          {o.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {o.note && <div className="text-xs text-slate-400 mt-1">{o.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canCancel && (
                            <button
                              onClick={() => { setConfirmId(o.id); setConfirmType("cancel"); }}
                              disabled={actionLoading === o.id}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          )}
                          {canRefund && (
                            <button
                              onClick={() => { setConfirmId(o.id); setConfirmType("refund"); }}
                              disabled={actionLoading === o.id}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded hover:bg-purple-100 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle size={12} /> Refund
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {confirmType === "cancel" ? "❌ Batalkan Pre-Order?" : "💰 Refund Pre-Order?"}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {confirmType === "cancel"
                ? "Pesanan akan dibatalkan dan saldo dikembalikan ke user (jika bayar via saldo)."
                : "Saldo akan dikembalikan ke user. Gunakan jika ada masalah dengan nomor tujuan."}
            </p>
            <input
              type="text"
              placeholder="Alasan (opsional)"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => doAction(confirmId, confirmType)}
                disabled={actionLoading === confirmId}
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors
                  ${confirmType === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}
                  disabled:opacity-50`}
              >
                {actionLoading === confirmId ? "Memproses..." : "Ya, Lanjutkan"}
              </button>
              <button
                onClick={() => { setConfirmId(null); setCancelNote(""); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
