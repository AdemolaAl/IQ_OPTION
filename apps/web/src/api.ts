const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "iq_token";

export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function setToken(t: string) { sessionStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

type ApiError = { error?: string; detail?: string; message?: string };

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const err = data as ApiError;
    throw new Error(err.error || err.detail || err.message || `HTTP ${res.status}`);
  }
  return data as T;
}

// ---- Endpoints ----
export const api = {
  auth: (initData: string) =>
    request<{ token: string; user: TgUser }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),

  iqConnect: (email: string, password: string, accountType: "PRACTICE" | "REAL") =>
    request<{ ok: boolean; balance: number }>("/api/iq/connect", {
      method: "POST",
      body: JSON.stringify({ email, password, account_type: accountType }),
    }),

  iqBalance: () => request<{ balance: number }>("/api/iq/balance"),

  iqOrder: (asset: string, amount: number, direction: "call" | "put", duration: number) =>
    request<{ order_id: number }>("/api/iq/order", {
      method: "POST",
      body: JSON.stringify({ asset, amount, direction, duration }),
    }),

  iqDisconnect: () => request<{ ok: boolean }>("/api/iq/disconnect", { method: "POST" }),
};

export type TgUser = { id: number; first_name: string; username?: string };