import { useState, useEffect, useCallback } from "react";
import { Package, Plus, Edit2, Trash2, RefreshCw, Zap, Settings, Tag, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  source: string;
  sku?: string;
  quota?: string;
  validity?: string;
};

type ProductMarkup = {
  sku: string;
  category: string;
  type: "flat" | "percentage";
  amount: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  akrab1: "AKRAB 1",
  akrab2: "AKRAB 2",
  circle: "CIRCLE",
  preorder: "PRE ORDER ⏳",
};

const EMPTY_FORM = { name: "", description: "", price: "", active: true, source: "manual", sku: "", quota: "", validity: "" };

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual (tanpa API)",
  dopu: "DOPU",
  api2: "KHFY",
  digiflaz: "Digiflaz",
};

function MarkupPanel({ category }: { category: string }) {
  const [markup, setMarkup] = useState<{ type: string; amount: number } | null>(null);
  const [editType, setEditType] = useState("flat");
  const [editAmount, setEditAmount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.markup.list().then((res) => {
      const m = res.data?.[category];
      if (m) {
        setMarkup(m);
        setEditType(m.type);
        setEditAmount(String(m.amount));
      } else {
        setMarkup({ type: "flat", amount: 0 });
        setEditType("flat");
        setEditAmount("0");
      }
    }).catch(() => {});
  }, [category]);

  async function save() {
    setSaving(true);
    try {
      const res = await api.markup.update(category, editType, Number(editAmount));
      setMarkup(res.data);
      setMsg("Markup disimpan!");
      setTimeout(() => setMsg(""), 2500);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Settings size={16} className="text-amber-600" />
        <span className="font-semibold text-amber-800 text-sm">Markup Kategori — {CATEGORY_LABELS[category]}</span>
        {markup && (
          <span className="ml-auto text-xs text-amber-600">
            Saat ini: {markup.type === "percentage" ? `${markup.amount}%` : `+Rp ${markup.amount.toLocaleString("id-ID")}`}
          </span>
        )}
      </div>
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium text-amber-700 mb-1">Tipe</label>
          <select
            value={editType}
            onChange={(e) => setEditType(e.target.value)}
            className="px-3 py-1.5 border border-amber-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="flat">Flat (Rp)</option>
            <option value="percentage">Persentase (%)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-amber-700 mb-1">
            Jumlah {editType === "percentage" ? "(%)" : "(Rp)"}
          </label>
          <input
            type="number"
            min="0"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            className="w-32 px-3 py-1.5 border border-amber-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder={editType === "percentage" ? "e.g. 5" : "e.g. 2000"}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Markup"}
        </button>
        {msg && <span className="text-xs text-amber-700 font-medium">{msg}</span>}
      </div>
      <p className="mt-2 text-xs text-amber-600">
        Markup kategori berlaku untuk semua produk yang tidak punya markup khusus per-produk.
      </p>
    </div>
  );
}

function ProductMarkupRow({
  product,
  category,
  markup,
  onSaved,
  onRemoved,
}: {
  product: Product;
  category: string;
  markup: ProductMarkup | null;
  onSaved: (m: ProductMarkup) => void;
  onRemoved: (sku: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"flat" | "percentage">(markup?.type ?? "flat");
  const [amount, setAmount] = useState(String(markup?.amount ?? "0"));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState("");

  const sku = product.sku ?? product.id;

  useEffect(() => {
    if (markup) {
      setType(markup.type);
      setAmount(String(markup.amount));
    } else {
      setType("flat");
      setAmount("0");
    }
  }, [markup]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await api.productMarkup.set(sku, category, type, Number(amount));
      onSaved(res.data);
      setMsg("Tersimpan!");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!markup) return;
    setRemoving(true);
    try {
      await api.productMarkup.remove(sku);
      onRemoved(sku);
      setOpen(false);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <tr className={`hover:bg-slate-50 ${open ? "bg-indigo-50" : ""}`}>
      <td className="px-4 py-3 text-slate-500 text-sm align-top">{product.name}</td>
      <td className="px-4 py-3 align-top">
        {markup ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
            <Tag size={10} />
            {markup.type === "percentage" ? `${markup.amount}%` : `+Rp ${markup.amount.toLocaleString("id-ID")}`}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">pakai markup kategori</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
            open
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50"
          }`}
        >
          <Tag size={11} />
          {open ? "Tutup" : "Atur"}
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {open && (
          <div className="mt-2 p-3 bg-white border border-indigo-200 rounded-xl shadow-sm min-w-[240px]">
            <div className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
              <Tag size={11} /> Markup Khusus — {product.name}
            </div>
            <div className="flex flex-col gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "flat" | "percentage")}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="flat">Flat (Rp)</option>
                <option value="percentage">Persentase (%)</option>
              </select>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder={type === "percentage" ? "e.g. 5" : "e.g. 2000"}
              />
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg disabled:opacity-50"
                >
                  <Check size={11} /> {saving ? "..." : "Simpan"}
                </button>
                {markup && (
                  <button
                    onClick={remove}
                    disabled={removing}
                    title="Hapus markup per-produk (kembali ke kategori)"
                    className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 text-xs rounded-lg disabled:opacity-50"
                  >
                    <X size={11} /> {removing ? "..." : "Reset"}
                  </button>
                )}
              </div>
              {msg && <span className="text-xs text-indigo-700 font-medium">{msg}</span>}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export function DaftarProduk({ category, categoryLabel }: { category: string; categoryLabel?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const displayLabel = categoryLabel ?? CATEGORY_LABELS[category] ?? category.toUpperCase();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [refreshing, setRefreshing] = useState(false);
  const [productMarkups, setProductMarkups] = useState<Record<string, ProductMarkup>>({});
  const [showMarkupTable, setShowMarkupTable] = useState(false);

  const loadMarkups = useCallback(async () => {
    try {
      const res = await api.productMarkup.list();
      const map: Record<string, ProductMarkup> = {};
      for (const m of (res.data ?? [])) {
        if (m.category === category) map[m.sku] = m;
      }
      setProductMarkups(map);
    } catch {}
  }, [category]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.packages.byCategory(category);
      setProducts(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadMarkups();
  }, [category]);

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
  function handleToggleActive(p: Product) {
    api.packages.update(category, p.id, { active: !p.active })
      .then(() => { showMsg(`${p.name} ${!p.active ? "diaktifkan" : "dinonaktifkan"}`); load(); })
      .catch((e: any) => showMsg(e.message, "error"));
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      active: p.active,
      source: p.source ?? "manual",
      sku: p.sku ?? "",
      quota: p.quota ?? "",
      validity: p.validity ?? "",
    });
    setShowForm(true);
    window.scrollTo(0, 0);
  }

  function handleMarkupSaved(m: ProductMarkup) {
    setProductMarkups((prev) => ({ ...prev, [m.sku]: m }));
  }

  function handleMarkupRemoved(sku: string) {
    setProductMarkups((prev) => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });
  }

  const activeMarkupsCount = Object.keys(productMarkups).length;

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

      <MarkupPanel category={category} />

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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                SKU {form.source !== "manual" ? <span className="text-red-500">*</span> : <span className="text-slate-400">(opsional)</span>}
              </label>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Contoh: XDA13"
                required={form.source !== "manual"}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kuota</label>
              <input
                value={form.quota}
                onChange={(e) => setForm({ ...form, quota: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Contoh: 10GB"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Masa Aktif</label>
              <input
                value={form.validity}
                onChange={(e) => setForm({ ...form, validity: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Contoh: 30 hari"
              />
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
            {form.source !== "manual" && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
                <strong>Provider {SOURCE_LABELS[form.source] ?? form.source}:</strong> pastikan SKU sesuai dengan SKU di dashboard provider. Bot akan memanggil API {SOURCE_LABELS[form.source] ?? form.source} saat ada order masuk.
              </div>
            )}
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

      {/* Product list table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
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
                  <th className="px-4 py-3 text-left font-medium">Harga Dasar</th>
                  <th className="px-4 py-3 text-left font-medium">Markup</th>
                  <th className="px-4 py-3 text-left font-medium">Sumber</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p, i) => {
                  const sku = p.sku ?? p.id;
                  const pm = productMarkups[sku] ?? null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        Rp {p.price.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        {pm ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            <Tag size={10} />
                            {pm.type === "percentage" ? `${pm.amount}%` : `+Rp ${pm.amount.toLocaleString("id-ID")}`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            p.source === "manual"
                              ? "bg-purple-100 text-purple-700"
                              : p.source === "dopu"
                              ? "bg-orange-100 text-orange-700"
                              : p.source === "digiflaz"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {SOURCE_LABELS[p.source] ?? p.source}
                          </span>
                          {p.sku && (
                            <span className="text-xs text-slate-400 font-mono">{p.sku}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
  <button
    onClick={() => handleToggleActive(p)}
    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
      p.active
        ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600"
        : "bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-700"
    }`}
    title={p.active ? "Klik untuk nonaktifkan" : "Klik untuk aktifkan"}
  >
    {p.active ? "✅ Aktif" : "⭕ Nonaktif"}
  </button>
</td>

                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(p)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                          >
                            <Edit2 size={11} /> Edit
                          </button>
                          {p.id.startsWith("manual_") && (
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Per-product markup panel */}
      {products.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMarkupTable(!showMarkupTable)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left"
          >
            <Tag size={16} className="text-indigo-600" />
            <span className="font-semibold text-indigo-800 text-sm">
              Markup Per-Produk
            </span>
            {activeMarkupsCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-indigo-600 text-white rounded-full text-xs font-medium">
                {activeMarkupsCount} aktif
              </span>
            )}
            <span className="ml-auto text-xs text-indigo-500">
              {showMarkupTable ? "Sembunyikan" : "Tampilkan"} editor
            </span>
            {showMarkupTable ? <ChevronUp size={16} className="text-indigo-500" /> : <ChevronDown size={16} className="text-indigo-500" />}
          </button>

          {showMarkupTable && (
            <div className="border-t border-indigo-200">
              <p className="px-5 py-2 text-xs text-indigo-600 bg-indigo-100">
                Markup per-produk menggantikan markup kategori untuk produk tersebut. Klik <strong>Atur</strong> di baris produk untuk mengatur.
              </p>
              <table className="w-full text-sm">
                <thead className="bg-indigo-100 text-indigo-700">
                  <tr>
                    <th className="px-5 py-2 text-left text-xs font-medium">Produk</th>
                    <th className="px-5 py-2 text-left text-xs font-medium">Markup Saat Ini</th>
                    <th className="px-5 py-2 text-left text-xs font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100 bg-white">
                  {products.map((p) => {
                    const sku = p.sku ?? p.id;
                    return (
                      <ProductMarkupRow
                        key={p.id}
                        product={p}
                        category={category}
                        markup={productMarkups[sku] ?? null}
                        onSaved={handleMarkupSaved}
                        onRemoved={handleMarkupRemoved}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
