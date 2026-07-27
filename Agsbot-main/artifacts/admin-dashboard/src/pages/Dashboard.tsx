import { useState, useEffect } from "react";
import { Users, Package, CreditCard, TrendingUp, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function formatRp(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.stats();
      setStats(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Ringkasan data bot Agsstorebot</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw size={24} className="animate-spin mr-2" /> Memuat...
        </div>
      ) : !stats ? (
        <div className="text-center py-20 text-slate-400">Gagal memuat data</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Users size={20} className="text-blue-600" />}
              label="Total Pengguna"
              value={stats.totalUsers}
              color="bg-blue-50"
            />
            <StatCard
              icon={<CreditCard size={20} className="text-green-600" />}
              label="Total Saldo"
              value={formatRp(stats.totalSaldo)}
              color="bg-green-50"
            />
            <StatCard
              icon={<Package size={20} className="text-purple-600" />}
              label="Total Order"
              value={stats.totalOrders}
              color="bg-purple-50"
            />
            <StatCard
              icon={<TrendingUp size={20} className="text-orange-600" />}
              label="Total Deposit"
              value={formatRp(stats.totalDeposit)}
              color="bg-orange-50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Status Order</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Pending</span>
                  <span className="text-sm font-semibold text-yellow-600">{stats.pendingOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Selesai</span>
                  <span className="text-sm font-semibold text-green-600">{stats.doneOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Transaksi</span>
                  <span className="text-sm font-semibold text-slate-800">{stats.totalOrders}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Status Deposit</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Topup</span>
                  <span className="text-sm font-semibold text-slate-800">{stats.totalTopups}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Deposit Berhasil</span>
                  <span className="text-sm font-semibold text-green-600">{formatRp(stats.totalDeposit)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
