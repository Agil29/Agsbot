import { useState, useEffect } from "react";
import { CreditCard, ShoppingBag, RefreshCw, X, Search, SendHorizonal } from "lucide-react";
import { api } from "@/lib/api";

function formatDate(s: string) {
  return new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function formatRp(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "Lunas", color: "bg-blue-100 text-blue-700" },
  processing: { label: "Proses", color: "bg-indigo-100 text-indigo-700" },
  done: { label: "Selesai", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Batal", color: "bg-red-100 text-red-700" },
};

const TOPUP_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
  confirming: { label: "Konfirmasi", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Berhasil", color: "bg-green-100 text-green-700" },
  expired: { label: "Kedaluarsa", color: "bg-slate-100 text-slate-500" },
  cancelled: { label: "Batal", color: "bg-red-100 text-red-700" },
  done: { label: "Berhasil", color: "bg-green-100 text-green-700" },
};

const PROVIDER_LABELS: Record<string, string> = {
  all: "Semua Provider",
  dopu: "DOPU (Akrab 1 & Circle)",
  khfy: "KHFY (Akrab 2)",
  digiflaz: "Digiflaz",
};

function getProvider(category: string, packageId?: string): string {
  if (packageId?.startsWith("digiflaz_")) return "digiflaz";
  if (category === "akrab2") return "khfy";
  return "dopu";
}

export function HistoryPenjualan() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.orders.list();
      setOrders(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const now = new Date();
  const start12m = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const orders12m = orders.filter((o) => new Date(o.createdAt) >= start12m && o.status === "done");
  const totalSpent12m = orders12m.reduce((s: number, o: any) => s + o.price, 0);
  const penghasilan12m = orders12m.reduce((s: number, o: any) => s + (o.price - (o.baseprice ?? o.price)), 0);

  const filtered = orders
    .filter((o) => providerFilter === "all" || getProvider(o.category, o.packageId) === providerFilter)
    .filter((o) => !search.trim() || String(o.id).toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingBag size={22} className="text-blue-600" /> History Penjualan
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} transaksi order</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Transaksi 12 Bulan", value: String(orders12m.length), color: "text-blue-600" },
          { label: "Total Pendapatan 12 Bln", value: formatRp(totalSpent12m), color: "text-green-600" },
          { label: "Penghasilan 12 Bln", value: formatRp(penghasilan12m), color: "text-purple-600" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Order ID..."
            className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          )}
        </div>
        {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setProviderFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              providerFilter === key
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Memuat...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {search ? `Tidak ada order dengan ID "${search}"` : "Belum ada order"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order ID</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Username</th>
                  <th className="px-4 py-3 text-left font-medium">No. Target</th>
                  <th className="px-4 py-3 text-left font-medium">Paket</th>
                  <th className="px-4 py-3 text-left font-medium">Provider</th>
                  <th className="px-4 py-3 text-left font-medium">Harga</th>
                  <th className="px-4 py-3 text-left font-medium">Penghasilan</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => {
                  const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, color: "bg-slate-100 text-slate-600" };
                  const provider = getProvider(o.category, o.packageId);
                  const providerLabel = provider === "khfy" ? "KHFY" : provider === "digiflaz" ? "Digiflaz" : "DOPU";
                  const providerColor = provider === "khfy" ? "bg-blue-50 text-blue-700" : provider === "digiflaz" ? "bg-green-100 text-green-700" : "bg-green-50 text-green-700";
                  const profit = o.price - (o.baseprice ?? o.price);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{o.userName}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {o.userUsername ? `@${o.userUsername}` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {o.nomorTujuan ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{o.packageName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${providerColor}`}>{providerLabel}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatRp(o.price)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-700">
                        {profit > 0 ? `+${formatRp(profit)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(o.createdAt)}</td>
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

export function DepositMember() {
  const [topups, setTopups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  const [tUserId, setTUserId] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [tLoading, setTLoading] = useState(false);
  const [tMsg, setTMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.topups.list();
      setTopups(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    const uid = parseInt(tUserId.trim(), 10);
    const amt = parseInt(tAmount.trim(), 10);
    if (isNaN(uid) || uid <= 0) { setTMsg({ text: "User ID tidak valid", ok: false }); return; }
    if (isNaN(amt) || amt === 0) { setTMsg({ text: "Nominal tidak valid", ok: false }); return; }
    setTLoading(true);
    setTMsg(null);
    try {
      const res = await api.users.setSaldo(uid, amt);
      const saldoNow = res?.data?.saldo;
      const label = amt > 0 ? `+Rp ${amt.toLocaleString("id-ID")}` : `-Rp ${Math.abs(amt).toLocaleString("id-ID")}`;
      setTMsg({ text: `✓ Berhasil transfer ${label} ke ID ${uid}${saldoNow !== undefined ? ` · Saldo sekarang Rp ${Number(saldoNow).toLocaleString("id-ID")}` : ""}`, ok: true });
      setTUserId(""); setTAmount("");
    } catch (e: any) {
      setTMsg({ text: e.message ?? "Gagal transfer", ok: false });
    } finally {
      setTLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function action(id: string, type: "approve" | "cancel") {
    try {
      if (type === "approve") await api.topups.approve(id);
      else await api.topups.cancel(id);
      setMsg(type === "approve" ? "Topup disetujui" : "Topup dibatalkan");
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setTimeout(() => setMsg(""), 3000);
    }
  }

  const totalDeposit = topups.filter((t) => t.status === "completed" || t.status === "done").reduce((s: number, t: any) => s + t.nominal, 0);
  const filteredTopups = search.trim()
    ? topups.filter((t) => String(t.id).toLowerCase().includes(search.trim().toLowerCase()))
    : topups;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={22} className="text-blue-600" /> Deposit Member
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Total deposit berhasil: {formatRp(totalDeposit)}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {msg && <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">{msg}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <SendHorizonal size={16} className="text-emerald-600" />
          <span className="font-semibold text-slate-800 text-sm">Transfer Saldo ke User</span>
        </div>
        <form onSubmit={handleTransfer} className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Telegram User ID</label>
            <input
              type="number"
              value={tUserId}
              onChange={(e) => setTUserId(e.target.value)}
              placeholder="contoh: 123456789"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Nominal (- untuk kurangi)</label>
            <input
              type="number"
              value={tAmount}
              onChange={(e) => setTAmount(e.target.value)}
              placeholder="contoh: 50000"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>
          <button
            type="submit"
            disabled={tLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <SendHorizonal size={14} />
            {tLoading ? "Memproses..." : "Transfer"}
          </button>
        </form>
        {tMsg && (
          <div className={`mt-2 px-3 py-2 rounded-lg text-sm ${tMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {tMsg.text}
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Order ID..."
            className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Memuat...</div>
          ) : filteredTopups.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {search ? `Tidak ada deposit dengan Order ID "${search}"` : "Belum ada topup"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order ID</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Nominal</th>
                  <th className="px-4 py-3 text-left font-medium">Fee</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTopups.map((t) => {
                  const st = TOPUP_STATUS_LABELS[t.status] ?? { label: t.status, color: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{t.userName}</td>
                      <td className="px-4 py-3">{formatRp(t.nominal)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatRp(t.fee)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{formatRp(t.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        {(t.status === "pending" || t.status === "confirming") && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => action(t.id, "approve")}
                              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => action(t.id, "cancel")}
                              className="px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex items-center gap-1"
                            >
                              Tolak
                            </button>
                          </div>
                        )}
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
