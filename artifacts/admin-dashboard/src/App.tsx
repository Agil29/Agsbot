import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { getStoredKey, clearStoredKey, api } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { PenggunaBot } from "@/pages/PenggunaBot";
import { DaftarProduk } from "@/pages/DaftarProduk";
import { HistoryPenjualan, DepositMember } from "@/pages/TopupMutasi";
import { BotSettings } from "@/pages/BotSettings";
import { PageAnalistik } from "@/pages/PageAnalistik";
import { PageBroadcast } from "@/pages/PageBroadcast";
import { PageSaldoLogs } from "@/pages/PageSaldoLogs";
import { PageBlacklist } from "@/pages/PageBlacklist";
import { PagePreOrder } from "@/pages/PagePreOrder";

function AppRoutes({ onLogout }: { onLogout: () => void }) {
  return (
    <Layout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={PageAnalistik} />
        <Route path="/analytics" component={PageAnalistik} />
        <Route path="/users" component={PenggunaBot} />
        <Route path="/products/akrab1">
          {() => <DaftarProduk category="akrab1" />}
        </Route>
        <Route path="/products/akrab2">
          {() => <DaftarProduk category="akrab2" />}
        </Route>
        <Route path="/products/circle">
          {() => <DaftarProduk category="circle" />}
        </Route>
        <Route path="/products/preorder">
          {() => <DaftarProduk category="preorder" />}
        </Route>
        <Route path="/products/preorder">
          {() => <DaftarProduk category="akrab2" categoryLabel="PRE ORDER" />}
        </Route>
        <Route path="/orders" component={HistoryPenjualan} />
        <Route path="/topups" component={DepositMember} />
        <Route path="/settings" component={BotSettings} />
        <Route path="/broadcast" component={PageBroadcast} />
        <Route path="/saldo-logs" component={PageSaldoLogs} />
        <Route path="/blacklist" component={PageBlacklist} />
        <Route path="/pre-orders" component={PagePreOrder} />
        <Route>
          <div className="text-center py-20 text-slate-400">Halaman tidak ditemukan</div>
        </Route>
      </Switch>
    </Layout>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const key = getStoredKey();
    if (!key) { setAuthed(false); return; }
    api.stats()
      .then(() => setAuthed(true))
      .catch(() => { clearStoredKey(); setAuthed(false); });
  }, []);

  function handleLogout() {
    clearStoredKey();
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-400">
        Memuat...
      </div>
    );
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AppRoutes onLogout={handleLogout} />
    </WouterRouter>
  );
}
