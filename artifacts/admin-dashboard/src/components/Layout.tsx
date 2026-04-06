import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Users, Package, CreditCard, Settings, ChevronDown, ChevronRight,
  BarChart3, Menu, X, Bot, LogOut, TrendingUp, Send, History,
} from "lucide-react";
import { clearStoredKey } from "@/lib/api";

type NavItem = {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: { label: string; href: string }[];
  section?: string;
};

const NAV: NavItem[] = [
  { label: "Page Analistik", icon: <TrendingUp size={18} />, href: "/analytics", section: "BOT MENU" },
  { label: "Pengguna Bot", icon: <Users size={18} />, href: "/users" },
  {
    label: "Daftar Produk", icon: <Package size={18} />,
    children: [
      { label: "Paket AKRAB 1", href: "/products/akrab1" },
      { label: "Paket AKRAB 2", href: "/products/akrab2" },
      { label: "Paket CIRCLE", href: "/products/circle" },
    ],
  },
  {
    label: "Topup & Mutasi", icon: <CreditCard size={18} />,
    children: [
      { label: "History Penjualan", href: "/orders" },
      { label: "Deposit Member", href: "/topups" },
      { label: "Log Mutasi Saldo", href: "/saldo-logs" },
    ],
  },
  { label: "Broadcast", icon: <Send size={18} />, href: "/broadcast" },
  {
    label: "Bot Settings", icon: <Settings size={18} />,
    children: [
      { label: "Integrasi API", href: "/settings" },
    ],
  },
];

function NavSection({ item, onNav }: { item: NavItem; onNav?: () => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some((c) => location === c.href);
  });

  if (item.href) {
    const active = location === item.href;
    return (
      <Link href={item.href} onClick={onNav}>
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors
          ${active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
          {item.icon}
          <span className="text-sm font-medium">{item.label}</span>
        </div>
      </Link>
    );
  }

  const anyActive = item.children?.some((c) => location === c.href);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors
          ${anyActive ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
      >
        {item.icon}
        <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="ml-7 mt-1 space-y-1">
          {item.children?.map((c) => {
            const active = location === c.href;
            return (
              <Link key={c.href} href={c.href} onClick={onNav}>
                <div className={`px-3 py-2 rounded-md text-sm cursor-pointer transition-colors
                  ${active ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"}`}>
                  {c.label}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Layout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
        <Bot size={24} className="text-blue-400" />
        <div>
          <div className="text-white font-bold text-sm leading-tight">Agsstorebot</div>
          <div className="text-slate-400 text-xs">Admin Panel</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV.map((item, i) => (
          <div key={item.label}>
            {item.section && (
              <p className={`px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 ${i === 0 ? "mb-1" : "mt-4 mb-1"}`}>
                {item.section}
              </p>
            )}
            <NavSection item={item} onNav={() => setMobileOpen(false)} />
          </div>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors w-full"
        >
          <LogOut size={18} />
          <span className="text-sm">Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-[hsl(224,71%,16%)] flex-shrink-0">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-60 bg-[hsl(224,71%,16%)] flex-shrink-0">{sidebar}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-1">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
            <span className="text-sm font-medium text-slate-700">Admin</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
