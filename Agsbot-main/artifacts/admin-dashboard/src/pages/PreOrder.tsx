import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw, XCircle, CheckCircle, Loader2, AlertTriangle, Search, Filter } from "lucide-react";
import { api } from "@/lib/api";

type PreOrderStatus = "pending" | "processing" | "done" | "cancelled";

type PreOrder = {
  id: string;
  userId: number;
  userName: string;
  userUsername?: string;
  packageId: string;
  packageName: string;
  sku: string;
  price: number;
  baseprice: number;
  nomorTujuan: string;
  paymentMethod: "saldo" | "qris";
  status: PreOrderStatus;
  note?: string;
  reffId?: string;
  sn?: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_CONFIG: Record<PreOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock size={12} />,
  },
  processing: {
    label: "Diproses",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  done: {
    label: "Selesai",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: <CheckCircle size={12} />,
  },
  cancelled: {
    label: "Dibatalkan",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: <XCircle size={12} />,
  },
};

function fmtDate(d: string) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const HH = String(dt.getHours()).padStart(2, "0");
  const MM = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

function CancelModal({
  po,
  onConfirm,
  onClose,
}: {
  po: PreOrder;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await onConfirm(note);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-red-500" />
          <h2 className="font-bold text-slate-800 text-lg">Batalkan Pre Order</h2>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-1">
          <p><span className="text-slate-500">ID:</span> <code className="font-mono text-slate-700">{po.id}</code></p>
          <p><span className="text-slate-500">Produk:</span> <strong>{po.packageName}</strong></p>
          <p><span className="text-slate-500">Nomor:</span> <code className="font-mono">{po.nomorTujuan}</code></p>
          <p><span className="text-slate-500">Harga:</span> <strong>Rp {po.price.toLocaleString("id-ID")}</strong></p>
          <p><span className="text-slate-500">Pembayaran:</span> <span className="uppercase font-medium">{po.paymentMethod}</span></p>
        </div>

        {po.paymentMethod === "saldo" && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-green-700">
            ✅ Saldo <strong>Rp {po.price.toLocaleString("id-ID")}</strong> akan otomatis dikembalikan ke user.
          </div>
        )}
        {po.paymentMethod === "qris" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-amber-700">
            ⚠️ Pembayaran via QRIS — refund perlu dilakukan manual ke user.
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Alasan pembatalan <span className="text-slate-400">(opsional)</span>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Diminta user, stok tidak tersedia, dll."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            {loading ? "Memproses..." : "Batalkan & Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PreOrderPage() {
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [cancelTarget, setCancelTarget] = useState<PreOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<PreOrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.preOrders.list();
      setOrders(res.data ?? []);
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showMsg(text: string, type: "success" | "error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 4000);
  }

  async function handleCancel(note: string) {
    if (!cancelTarget) return;
    try {
      await api.preOrders.cancel(cancelTarget.id, note || undefined);
      showMsg(`Pre order ${cancelTarget.id} berhasil dibatalkan.`);
      setCancelTarget(null);
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
      setCancelTarget(null);
    }
  }

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.nomorTujuan.includes(q) ||
      o.packageName.toLowerCase().includes(q) ||
      o.userName.toLowerCase().includes(q) ||
      (o.userUsername ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    processing: orders.filter((o) => o.status === "processing").length,
    done: orders.filter((o) => o.status === "done").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  return (
    <div>
      {cancelTarget && (
        <CancelModal
          po={cancelTarget}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock size={22} className="text-amber-500" /> Pre Order
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Antrian pre order — diproses otomatis saat stok KHFY tersedia
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {(["pending", "processing", "done", "cancelled"] as PreOrderStatus[]).map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors ${
                filterStatus === s
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-left">
                <p className="text-xs text-slate-500 font-medium">{cfg.label}</p>
                <p className="text-2xl font-bold text-slate-800">{counts[s]}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                {cfg.icon}
              </span>
            </button>
          );
        })}
      </div>

      {msg.text && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          msg.type === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari ID, nomor, paket, user..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">Semua ({counts.all})</option>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="processing">Diproses ({counts.processing})</option>
            <option value="done">Selesai ({counts.done})</option>
            <option value="cancelled">Dibatalkan ({counts.cancelled})</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            Memuat data...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Clock size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-slate-400">Tidak ada pre order</p>
            {(filterStatus !== "all" || search) && (
              <button
                onClick={() => { setFilterStatus("all"); setSearch(""); }}
                className="mt-2 text-blue-500 text-sm hover:underline"
              >
                Reset filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Pre Order ID</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Produk / SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Nomor</th>
                  <th className="px-4 py-3 text-left font-medium">Harga</th>
                  <th className="px-4 py-3 text-left font-medium">Bayar</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Dibuat</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((po) => {
                  const cfg = STATUS_CONFIG[po.status];
                  const canCancel = po.status === "pending" || po.status === "processing";
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {po.id}
                        </code>
                        {po.sn && (
                          <div className="text-xs text-slate-400 mt-0.5 font-mono">SN: {po.sn}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{po.userName}</div>
                        {po.userUsername && (
                          <div className="text-xs text-slate-400">@{po.userUsername}</div>
                        )}
                        <div className="text-xs text-slate-400">ID: {po.userId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{po.packageName}</div>
                        <div className="text-xs text-slate-400 font-mono">{po.sku}</div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm font-mono text-slate-700">{po.nomorTujuan}</code>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        Rp {po.price.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                          po.paymentMethod === "saldo"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-cyan-100 text-cyan-700"
                        }`}>
                          {po.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {po.note && (
                          <div className="text-xs text-slate-400 mt-0.5 max-w-[140px] truncate" title={po.note}>
                            {po.note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(po.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {canCancel ? (
                          <button
                            onClick={() => setCancelTarget(po)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors"
                          >
                            <XCircle size={12} /> Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">ℹ️ Cara kerja Pre Order</p>
        <ul className="space-y-1 text-amber-700 list-disc list-inside">
          <li>User memilih paket AKRAB V2 (KHFY) dan membayar — dana langsung ditahan</li>
          <li>Bot cek stok KHFY setiap <strong>3 menit</strong></li>
          <li>Jika stok tersedia, pre order otomatis dikirim ke KHFY dan user dinotifikasi</li>
          <li>Pre order <strong>Pending</strong> = menunggu stok, <strong>Diproses</strong> = sudah dikirim ke KHFY</li>
          <li>Klik <strong>Cancel</strong> untuk batalkan dan otomatis refund saldo user (untuk pembayaran saldo)</li>
        </ul>
      </div>
    </div>
  );
}
