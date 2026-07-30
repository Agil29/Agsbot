import { useState, useEffect } from "react";
import {
  RefreshCw, DollarSign, ShoppingCart, TrendingUp,
  Wallet, Server, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";

function formatRp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatRpFull(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

type StatCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  badge?: string;
};

function StatCard({ icon, iconBg, label, value, sub, subColor, badge }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-800">{value}</span>
          {badge && (
            <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{badge}</span>
          )}
        </div>
        <p className={`text-xs mt-1 ${subColor ?? "text-slate-400"}`}>{sub}</p>
      </div>
    </div>
  );
}

const CHART_COLORS: Record<string, string> = {
  orders: "#3b82f6",
  topups: "#10b981",
  users: "#8b5cf6",
};

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function SimpleBarChart({ data, dataKey, color }: { data: Array<Record<string, unknown>>; dataKey: string; color: string }) {
  const values = data.map((d) => Number(d[dataKey] ?? 0));
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-48 w-full">
      {data.map((d, i) => {
        const val = Number(d[dataKey] ?? 0);
        const pct = Math.round((val / max) * 100);
        const label = String(d["label"] ?? "");
        const showLabel = i % 5 === 0 || i === data.length - 1;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative">
            <div className="w-full rounded-t transition-all" style={{ height: `${Math.max(pct, 1)}%`, backgroundColor: color, opacity: 0.8 }} title={`${label}: ${val}`} />
            {showLabel && <span className="text-[9px] text-slate-400 absolute -bottom-4 truncate w-6 text-center">{label}</span>}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
              {label}: <strong className="ml-1">{val}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PageAnalistik() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartView, setChartView] = useState<"orders" | "topups" | "users">("orders");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.analytics();
      setData((res as Record<string, unknown>).data as Record<string, unknown> ?? res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <RefreshCw size={22} className="animate-spin mr-2" /> Memuat analitik...
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-24 text-red-500 gap-2">
      <AlertCircle size={20} /> Gagal memuat data: {error}
    </div>
  );

  const chartData = ((data?.["dailyChart"] as Array<Record<string, unknown>>) ?? []).map((d) => ({
    ...d,
    label: formatChartDate(String(d["date"] ?? "")),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={22} className="text-blue-600" /> Page Analistik
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{today}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mb-5 flex gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${data?.["api1Configured"] ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
          <Server size={13} />
          API 1: {data?.["api1Configured"] ? String(data?.["api1Label"] ?? "OK") : "Belum dikonfigurasi"}
          <span className={`w-1.5 h-1.5 rounded-full ${data?.["api1Configured"] ? "bg-green-500" : "bg-amber-400"}`} />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${data?.["api2Configured"] ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
          <Server size={13} />
          API 2: {data?.["api2Configured"] ? String(data?.["api2Label"] ?? "OK") : "Belum dikonfigurasi"}
          <span className={`w-1.5 h-1.5 rounded-full ${data?.["api2Configured"] ? "bg-green-500" : "bg-amber-400"}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard icon={<Wallet size={24} className="text-blue-600" />} iconBg="bg-blue-50" label="Deposit Member" value={formatRp(Number(data?.["depositMember"] ?? 0))} sub={`Bulan ini: ${formatRpFull(Number(data?.["monthDeposit"] ?? 0))}`} subColor="text-blue-500" />
        <StatCard icon={<TrendingUp size={24} className="text-green-600" />} iconBg="bg-green-50" label="Penghasilan" value={formatRp(Number(data?.["penghasilan"] ?? 0))} sub="Dari order selesai bulan ini" subColor="text-green-500" badge="Bln ini" />
        <StatCard icon={<ShoppingCart size={24} className="text-purple-600" />} iconBg="bg-purple-50" label="Produk Terjual" value={String(data?.["produkTerjual"] ?? 0)} sub={`Total selesai: ${data?.["totalOrders"] ?? 0} order`} subColor="text-purple-500" badge="Bln ini" />
        <StatCard icon={<Server size={24} className="text-orange-600" />} iconBg="bg-orange-50" label="Saldo DOPU" value={data?.["dopuBalance"] != null ? formatRp(Number(data["dopuBalance"])) : data?.["api1Configured"] ? "Gagal ambil" : "—"} sub={data?.["dopuBalance"] != null ? `Rp ${Number(data["dopuBalance"]).toLocaleString("id-ID")}` : "Saldo API Akrab 1 & Circle"} subColor={data?.["dopuBalance"] != null ? "text-orange-600 font-medium" : "text-orange-500"} />
        <StatCard icon={<DollarSign size={24} className="text-cyan-600" />} iconBg="bg-cyan-50" label="Saldo KHFY" value={data?.["khfyBalance"] != null ? formatRp(Number(data["khfyBalance"])) : data?.["api2Configured"] ? "Cek manual" : "—"} sub={data?.["khfyBalance"] != null ? `Rp ${Number(data["khfyBalance"]).toLocaleString("id-ID")}` : "API saldo tidak tersedia"} subColor={data?.["khfyBalance"] != null ? "text-cyan-600 font-medium" : "text-slate-400"} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-slate-800">Aktivitas Harian</h2>
            <p className="text-xs text-slate-400 mt-0.5">30 hari terakhir</p>
          </div>
          <div className="flex gap-2">
            {(["orders", "topups", "users"] as const).map((v) => (
              <button key={v} onClick={() => setChartView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${chartView === v ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {v === "orders" ? "Order" : v === "topups" ? "Topup" : "User Baru"}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Belum ada data aktivitas</div>
        ) : (
          <div className="pb-5"><SimpleBarChart data={chartData} dataKey={chartView} color={CHART_COLORS[chartView] ?? "#3b82f6"} /></div>
        )}
        <div className="flex items-center gap-5 mt-4 justify-center">
          {[{ key: "orders", label: "Order", color: CHART_COLORS["orders"] }, { key: "topups", label: "Topup", color: CHART_COLORS["topups"] }, { key: "users", label: "User Baru", color: CHART_COLORS["users"] }].map((item) => (
            <button key={item.key} onClick={() => setChartView(item.key as "orders" | "topups" | "users")} className={`flex items-center gap-1.5 text-xs transition-opacity ${chartView === item.key ? "opacity-100" : "opacity-40 hover:opacity-70"}`}>
              <span className="w-3 h-2 rounded" style={{ backgroundColor: item.color, display: "inline-block" }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {[
          { label: "Total Order Selesai", value: String(data?.["totalOrders"] ?? 0), color: "text-blue-600" },
          { label: "Total Topup Berhasil", value: formatRpFull(Number(data?.["depositMember"] ?? 0)), color: "text-green-600" },
          { label: "Produk Terjual Bulan Ini", value: String(data?.["produkTerjual"] ?? 0), color: "text-purple-600" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
