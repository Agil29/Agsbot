import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { History, ArrowUpCircle, ArrowDownCircle, RefreshCw, ShieldCheck, TrendingDown } from "lucide-react";

type SaldoLog = {
  id: number;
  telegramId: number;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  refId?: string;
  note?: string;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  topup:        { label: "Topup",         color: "text-emerald-600 bg-emerald-50", icon: <ArrowUpCircle size={15} /> },
  order_deduct: { label: "Order",         color: "text-red-600 bg-red-50",         icon: <ArrowDownCircle size={15} /> },
  order_refund: { label: "Refund",        color: "text-amber-600 bg-amber-50",     icon: <RefreshCw size={15} /> },
  admin_credit: { label: "Admin +",       color: "text-blue-600 bg-blue-50",       icon: <ShieldCheck size={15} /> },
  admin_deduct: { label: "Admin −",       color: "text-purple-600 bg-purple-50",   icon: <TrendingDown size={15} /> },
  admin_set:    { label: "Admin Set",     color: "text-slate-600 bg-slate-100",    icon: <ShieldCheck size={15} /> },
};

function fmtRp(n: number) {
  return `Rp ${Math.abs(n).toLocaleString("id-ID")}`;
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function PageSaldoLogs() {
  const [logs, setLogs] = useState<SaldoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.saldoLogs.list();
      setLogs(res.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? logs : logs.filter(l => l.type === filter);

  const totalIn = logs.filter(l => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const totalOut = logs.filter(l => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <History size={22} className="text-blue-600" /> Log Mutasi Saldo
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Riwayat setiap perubahan saldo user</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Entri", value: logs.length.toLocaleString(), color: "bg-white" },
          { label: "Total Masuk", value: fmtRp(totalIn), color: "bg-emerald-50 text-emerald-700" },
          { label: "Total Keluar", value: fmtRp(totalOut), color: "bg-red-50 text-red-700" },
          { label: "Net", value: fmtRp(totalIn - totalOut), color: totalIn >= totalOut ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700" },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl p-4 border border-slate-100`}>
            <div className="text-xs text-slate-500 mb-1">{s.label}</div>
            <div className="font-bold text-sm">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 flex-wrap">
          <span className="text-sm text-slate-500 mr-1">Filter:</span>
          {["all", "topup", "order_deduct", "order_refund", "admin_credit", "admin_deduct"].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
              }`}>
              {t === "all" ? "Semua" : TYPE_META[t]?.label ?? t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Memuat...</div>
        ) : error ? (
          <div className="py-16 text-center text-red-500 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Belum ada log mutasi saldo.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Waktu</th>
                  <th className="text-left px-4 py-3">Telegram ID</th>
                  <th className="text-left px-4 py-3">Tipe</th>
                  <th className="text-right px-4 py-3">Delta</th>
                  <th className="text-right px-4 py-3">Sebelum</th>
                  <th className="text-right px-4 py-3">Sesudah</th>
                  <th className="text-left px-4 py-3">Ref / Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(log => {
                  const meta = TYPE_META[log.type] ?? { label: log.type, color: "text-slate-600 bg-slate-100", icon: null };
                  const isPlus = log.delta > 0;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(log.createdAt)}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{log.telegramId}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isPlus ? "text-emerald-600" : "text-red-500"}`}>
                        {isPlus ? "+" : "−"}{fmtRp(log.delta)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{fmtRp(log.balanceBefore)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtRp(log.balanceAfter)}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs">
                        {log.refId && <span className="font-mono text-xs bg-slate-100 px-1 rounded mr-1">{log.refId}</span>}
                        {log.note && <span className="text-xs">{log.note}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
