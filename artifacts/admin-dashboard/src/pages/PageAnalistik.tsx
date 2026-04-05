import { useState, useEffect } from "react";
import {
  RefreshCw, DollarSign, ShoppingCart, TrendingUp, Users,
  Wallet, Server, AlertCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
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

const CHART_COLORS = {
  orders: "#3b82f6",
  topups: "#10b981",
  users: "#8b5cf6",
};

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function PageAnalistik() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartView, setChartView] = useState<"orders" | "topups" | "users">("orders");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.analytics();
      setData(res.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <RefreshCw size={22} className="animate-spin mr-2" /> Memuat analitik...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500 gap-2">
        <AlertCircle size={20} /> Gagal memuat data: {error}
      </div>
    );
  }

  const chartData = (data?.dailyChart ?? []).map((d: any) => ({
    ...d,
    label: formatChartDate(d.date),
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={22} className="text-blue-600" /> Page Analistik
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{today}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* API Status Banner */}
      <div className="mb-5 flex gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
          data?.api1Configured
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <Server size={13} />
          API 1: {data?.api1Configured ? data?.api1Label : "Belum dikonfigurasi"}
          <span className={`w-1.5 h-1.5 rounded-full ${data?.api1Configured ? "bg-green-500" : "bg-amber-400"}`} />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
          data?.api2Configured
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <Server size={13} />
          API 2: {data?.api2Configured ? data?.api2Label : "Belum dikonfigurasi"}
          <span className={`w-1.5 h-1.5 rounded-full ${data?.api2Configured ? "bg-green-500" : "bg-amber-400"}`} />
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          icon={<Wallet size={24} className="text-blue-600" />}
          iconBg="bg-blue-50"
          label="Deposit Member"
          value={formatRp(data?.depositMember ?? 0)}
          sub={`Bulan ini: ${formatRpFull(data?.monthDeposit ?? 0)}`}
          subColor="text-blue-500"
        />
        <StatCard
          icon={<TrendingUp size={24} className="text-green-600" />}
          iconBg="bg-green-50"
          label="Penghasilan"
          value={formatRp(data?.penghasilan ?? 0)}
          sub="Dari order selesai bulan ini"
          subColor="text-green-500"
          badge="Bln ini"
        />
        <StatCard
          icon={<ShoppingCart size={24} className="text-purple-600" />}
          iconBg="bg-purple-50"
          label="Produk Terjual"
          value={String(data?.produkTerjual ?? 0)}
          sub={`Total selesai: ${data?.totalOrders ?? 0} order`}
          subColor="text-purple-500"
          badge="Bln ini"
        />
        <StatCard
          icon={<Server size={24} className="text-orange-600" />}
          iconBg="bg-orange-50"
          label="Saldo DOPU"
          value={data?.dopuBalance != null ? formatRp(data.dopuBalance) : "—"}
          sub="Saldo API Akrab 1 & Circle"
          subColor="text-orange-500"
        />
        <StatCard
          icon={<DollarSign size={24} className="text-cyan-600" />}
          iconBg="bg-cyan-50"
          label="Saldo KHFY"
          value={data?.khfyBalance != null ? formatRp(data.khfyBalance) : "—"}
          sub="Saldo API Akrab 2"
          subColor="text-cyan-500"
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-slate-800">Aktivitas Harian</h2>
            <p className="text-xs text-slate-400 mt-0.5">30 hari terakhir</p>
          </div>
          <div className="flex gap-2">
            {(["orders", "topups", "users"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  chartView === v
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {v === "orders" ? "Order" : v === "topups" ? "Topup" : "User Baru"}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Belum ada data aktivitas
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.orders} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_COLORS.orders} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTopups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.topups} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_COLORS.topups} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.users} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_COLORS.users} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ fontWeight: 600, color: "#1e293b" }}
              />
              {chartView === "orders" && (
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke={CHART_COLORS.orders}
                  strokeWidth={2.5}
                  fill="url(#colorOrders)"
                  name="Order"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              )}
              {chartView === "topups" && (
                <Area
                  type="monotone"
                  dataKey="topups"
                  stroke={CHART_COLORS.topups}
                  strokeWidth={2.5}
                  fill="url(#colorTopups)"
                  name="Topup"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              )}
              {chartView === "users" && (
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke={CHART_COLORS.users}
                  strokeWidth={2.5}
                  fill="url(#colorUsers)"
                  name="User Baru"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Chart Legend */}
        <div className="flex items-center gap-5 mt-3 justify-center">
          {[
            { key: "orders", label: "Order", color: CHART_COLORS.orders },
            { key: "topups", label: "Topup", color: CHART_COLORS.topups },
            { key: "users", label: "User Baru", color: CHART_COLORS.users },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setChartView(item.key as any)}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${
                chartView === item.key ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`}
            >
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: item.color, display: "inline-block" }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Footer */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        {[
          { label: "Total Order Selesai", value: data?.totalOrders ?? 0, color: "text-blue-600" },
          { label: "Total Topup Berhasil", value: `${formatRpFull(data?.depositMember ?? 0)}`, color: "text-green-600" },
          { label: "Produk Terjual Bulan Ini", value: data?.produkTerjual ?? 0, color: "text-purple-600" },
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
