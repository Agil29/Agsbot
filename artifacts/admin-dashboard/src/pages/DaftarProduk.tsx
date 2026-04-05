import { useState, useEffect } from "react";
import { Package, Plus, Edit2, Trash2, RefreshCw, Zap } from "lucide-react";
import { api } from "@/lib/api";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  source: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  akrab1: "AKRAB 1",
  akrab2: "AKRAB 2",
  circle: "CIRCLE",
};

const EMPTY_FORM = { name: "", description: "", price: "", active: true };

export function DaftarProduk({ category }: { category: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.packages.byCategory(category);
      setProducts(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [category]);

  function showMsg(text: string, type: "success" | "error" = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form, price: Number(form.price) };
      if (editId) {
        await api.packages.update(category, editId, data);
        showMsg("Paket diperbarui");
      } else {
        await api.packages.create(category, data);
        showMsg("Paket ditambahkan");
      }
      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus paket ini?")) return;
    try {
      await api.packages.delete(category, id);
      showMsg("Paket dihapus");
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.packages.refresh();
      showMsg("Paket berhasil di-refresh dari API");
      load();
    } catch (e: any) {
      showMsg(e.message, "error");
    } finally {
      setRefreshing(false);
    }
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description, price: String(p.price), active: p.active });
    setShowForm(true);
    window.scrollTo(0, 0);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={22} className="text-blue-600" /> Paket {CATEGORY_LABELS[category]}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{products.length} paket tersedia</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors"
          >
            <Zap size={14} /> {refreshing ? "Refreshing..." : "Refresh API"}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ ...EMPTY_FORM }); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} /> Tambah Paket
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

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">{editId ? "Edit Paket" : "Tambah Paket Baru"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Nama Paket *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Contoh: SuperMini"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Harga (Rp) *</label>
              <input
                required
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="15000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Deskripsi paket (opsional)"
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {saving ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Tambah Paket"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Memuat paket...
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center">
              <Package size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-slate-400">Belum ada paket</p>
              <p className="text-slate-400 text-xs mt-1">Tambah manual atau sambungkan ke API</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Nama</th>
                  <th className="px-4 py-3 text-left font-medium">Harga</th>
                  <th className="px-4 py-3 text-left font-medium">Sumber</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      Rp {p.price.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        p.source === "manual"
                          ? "bg-purple-100 text-purple-700"
                          : p.source === "dopu"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {p.source === "manual" ? "Manual" : p.source === "dopu" ? "DOPU" : "KHFY"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        p.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {p.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(p)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                        {p.source === "manual" && (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex items-center gap-1"
                          >
                            <Trash2 size={11} /> Hapus
                          </button>
                        )}
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
