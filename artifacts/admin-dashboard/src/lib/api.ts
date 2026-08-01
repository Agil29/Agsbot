const ADMIN_KEY_STORAGE = "admin_api_key";

export function getStoredKey(): string {
  return localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
}

export function setStoredKey(key: string) {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearStoredKey() {
  localStorage.removeItem(ADMIN_KEY_STORAGE);
}

export async function apiLogin(username: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Login gagal");
  }
  return res.json();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = getStoredKey();
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": key,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }

  return res.json();
}

export const api = {
  stats: () => request<any>("GET", "/stats"),
  users: {
    list: () => request<any>("GET", "/users"),
    setSaldo: (telegramId: number, amount: number) =>
      request<any>("POST", `/users/${telegramId}/saldo`, { amount }),
    delete: (telegramId: number) => request<any>("DELETE", `/users/${telegramId}`),
  },
  packages: {
    list: () => request<any>("GET", "/packages"),
    byCategory: (cat: string) => request<any>("GET", `/packages/${cat}`),
    create: (cat: string, data: any) => request<any>("POST", `/packages/${cat}`, data),
    update: (cat: string, id: string, data: any) => request<any>("PUT", `/packages/${cat}/${id}`, data),
    delete: (cat: string, id: string) => request<any>("DELETE", `/packages/${cat}/${id}`),
    refresh: () => request<any>("POST", "/refresh"),
  },
  orders: {
    list: () => request<any>("GET", "/orders"),
    setStatus: (orderId: string, status: string) =>
      request<any>("PUT", `/orders/${orderId}/status`, { status }),
  },
  topups: {
    list: () => request<any>("GET", "/topups"),
    approve: (id: string) => request<any>("PUT", `/topups/${id}/approve`),
    cancel: (id: string) => request<any>("PUT", `/topups/${id}/cancel`),
  },
  settings: {
    get: () => request<any>("GET", "/settings"),
    update: (data: any) => request<any>("PUT", "/settings", data),
  },
  analytics: () => request<any>("GET", "/analytics"),
  broadcast: (message: string) =>
    request<any>("POST", "/broadcast", { message, parseMode: "HTML" }),
  saldoLogs: {
    list: () => request<any>("GET", "/saldo-logs"),
    byUser: (telegramId: number) => request<any>("GET", `/saldo-logs/${telegramId}`),
  },
  markup: {
    list: () => request<any>("GET", "/markup"),
    update: (category: string, type: string, amount: number) =>
      request<any>("PUT", `/markup/${category}`, { type, amount }),
  },
  blacklist: {
    list: () => request<any>("GET", "/blacklist"),
    add: (telegramId: number, reason?: string) =>
      request<any>("POST", `/blacklist/${telegramId}`, { reason }),
    remove: (telegramId: number) =>
      request<any>("DELETE", `/blacklist/${telegramId}`),
  },
  productMarkup: {
    list: () => request<any>("GET", "/product-markup"),
    set: (sku: string, category: string, type: string, amount: number) =>
      request<any>("PUT", `/product-markup/${encodeURIComponent(sku)}`, { category, type, amount }),
    remove: (sku: string) =>
      request<any>("DELETE", `/product-markup/${encodeURIComponent(sku)}`),
  },
  request: <T = any>(method: string, path: string, body?: unknown) =>
    request<T>(method as any, path, body),
};
