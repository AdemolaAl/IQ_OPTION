import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, setToken, type TgUser } from "./api";
import "./index.css";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        initData: string;
        HapticFeedback: {
          impactOccurred: (s: string) => void;
          notificationOccurred: (t: string) => void;
        };
        themeParams: Record<string, string>;
        colorScheme: "dark" | "light";
      };
    };
  }
}

type Screen = "boot" | "iq-login" | "dashboard";
type Toast = { id: number; type: "ok" | "err"; text: string };

const haptic = {
  tap: () => window.Telegram?.WebApp.HapticFeedback.impactOccurred("light"),
  success: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success"),
  error: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred("error"),
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (type: "ok" | "err", text: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) { setBootError("Open this inside Telegram"); return; }
    tg.ready();
    tg.expand();
    applyTelegramTheme(tg);

    if (!tg.initData) { setBootError("Missing initData. Open via the bot button."); return; }

    api.auth(tg.initData)
      .then((d) => { setToken(d.token); setTgUser(d.user); setScreen("iq-login"); })
      .catch((e) => setBootError(e.message));
  }, []);

  if (bootError) return <Splash><ErrorState msg={bootError} /></Splash>;
  if (screen === "boot") return <Splash><div className="spinner" /><p style={{ color: "var(--text-dim)" }}>Connecting…</p></Splash>;

  return (
    <>
      <ToastStack toasts={toasts} />
      <div className="app">
        <Header user={tgUser} onDisconnect={screen === "dashboard" ? () => {
          api.iqDisconnect().finally(() => { setScreen("iq-login"); });
        } : undefined} />

        {screen === "iq-login" && (
          <IqLogin
            onSuccess={() => { haptic.success(); pushToast("ok", "Connected"); setScreen("dashboard"); }}
            onError={(m) => { haptic.error(); pushToast("err", m); }}
          />
        )}
        {screen === "dashboard" && (
          <Dashboard
            onToast={pushToast}
            onSessionLost={() => setScreen("iq-login")}
          />
        )}
      </div>
    </>
  );
}

/* ---------- Login ---------- */
function IqLogin({ onSuccess, onError }: { onSuccess: () => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"PRACTICE" | "REAL">("PRACTICE");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.iqConnect(email, password, accountType);
      onSuccess();
    } catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="brand">
        <div className="brand-mark">IQ</div>
        <div className="brand-title">Connect Account</div>
        <div className="brand-sub">Link your IQ Option to start trading</div>
      </div>

      <div className="alert alert-warn">
        <span>⚠️</span>
        <span>Use a demo account. Automated trading via unofficial APIs may violate broker ToS.</span>
      </div>

      <div className="card">
        <div className="field">
          <label className="field-label">Email</label>
          <input className="input" type="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">Password</label>
          <input className="input" type="password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">Account Type</label>
          <div className="segmented">
            {(["PRACTICE", "REAL"] as const).map((t) => (
              <button key={t} onClick={() => { haptic.tap(); setAccountType(t); }}
                className={clsx("seg", accountType === t && "active")}>
                {t === "PRACTICE" ? "Demo" : "Real"}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={submit}
          disabled={loading || !email || !password}>
          {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, margin: 0 }} /> : "Connect"}
        </button>
      </div>
    </>
  );
}

/* ---------- Dashboard ---------- */
const ASSETS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",   // weekday
  "EURUSD-OTC", "GBPUSD-OTC", "USDJPY-OTC"  // weekend/24-7
];
const QUICK_AMOUNTS = [1, 5, 10, 25, 50];
const DURATIONS = [1, 5, 15];

function Dashboard({ onToast, onSessionLost }: {
  onToast: (t: "ok" | "err", m: string) => void;
  onSessionLost: () => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [asset, setAsset] = useState("EURUSD");
  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(1);
  const [placing, setPlacing] = useState<"call" | "put" | null>(null);

  const loadBalance = async () => {
    setRefreshing(true);
    try { const { balance } = await api.iqBalance(); setBalance(balance); }
    catch (e: any) {
      if (e.message.includes("401") || e.message.includes("not connected")) {
        onSessionLost();
      } else onToast("err", e.message);
    }
    finally { setRefreshing(false); }
  };

  useEffect(() => { loadBalance(); }, []);

  const trade = async (direction: "call" | "put") => {
    setPlacing(direction);
    try {
      const { order_id } = await api.iqOrder(asset, amount, direction, duration);
      haptic.success();
      onToast("ok", `${direction.toUpperCase()} placed · #${order_id}`);
      loadBalance();
    } catch (e: any) {
      haptic.error();
      onToast("err", e.message);
    } finally { setPlacing(null); }
  };

  return (
    <>
      <div className="card">
        <div className="card-label">Balance</div>
        <div className="balance">
          <div className="balance-value">
            <span className="currency">$</span>
            {balance === null ? "—" : balance.toFixed(2)}
          </div>
          <button className={clsx("icon-btn", refreshing && "spin")}
            onClick={() => { haptic.tap(); loadBalance(); }} aria-label="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">New Trade</div>

        <div className="field">
          <label className="field-label">Asset</label>
          <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)}>
            {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Amount (USD)</label>
          <div className="amount-row">
            <button className="stepper" onClick={() => { haptic.tap(); setAmount((a) => Math.max(1, a - 1)); }}>−</button>
            <input className="input" type="number" min={1} value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} />
            <button className="stepper" onClick={() => { haptic.tap(); setAmount((a) => a + 1); }}>+</button>
          </div>
          <div className="chips">
            {QUICK_AMOUNTS.map((v) => (
              <button key={v} onClick={() => { haptic.tap(); setAmount(v); }}
                className={clsx("chip", amount === v && "active")}>
                ${v}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Expiry</label>
          <div className="segmented">
            {DURATIONS.map((d) => (
              <button key={d} onClick={() => { haptic.tap(); setDuration(d); }}
                className={clsx("seg", duration === d && "active")}>
                {d}m
              </button>
            ))}
          </div>
        </div>

        <div className="trade-row">
          <button className="btn btn-call" onClick={() => trade("call")} disabled={placing !== null}>
            {placing === "call" ? <MiniSpinner /> : <>▲ CALL</>}
          </button>
          <button className="btn btn-put" onClick={() => trade("put")} disabled={placing !== null}>
            {placing === "put" ? <MiniSpinner /> : <>▼ PUT</>}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Chrome ---------- */
function Header({ user, onDisconnect }: { user: TgUser | null; onDisconnect?: () => void }) {
  const initial = user?.first_name?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="header">
      <div className="header-user">
        <div className="avatar">{initial}</div>
        <div>
          <div className="header-name">{user?.first_name ?? "…"}</div>
          <div className="header-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="status-dot" /> Connected
          </div>
        </div>
      </div>
      {onDisconnect && (
        <button className="icon-btn" onClick={() => { haptic.tap(); onDisconnect(); }} aria-label="Disconnect">
          <LogoutIcon />
        </button>
      )}
    </div>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return <div className="splash"><div className="splash-inner">{children}</div></div>;
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
      <div style={{ color: "var(--text-dim)", fontSize: 14 }}>{msg}</div>
    </>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={clsx("toast", t.type)}>
          <div className="toast-icon">{t.type === "ok" ? "✓" : "!"}</div>
          <div>{t.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Icons ---------- */
function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function MiniSpinner() {
  return <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0, borderTopColor: "white" }} />;
}

/* ---------- Theme ---------- */
function applyTelegramTheme(tg: NonNullable<Window["Telegram"]>["WebApp"]) {
  const p = tg.themeParams;
  const root = document.documentElement;
  if (p.bg_color) root.style.setProperty("--bg", p.bg_color);
  if (p.secondary_bg_color) root.style.setProperty("--surface", p.secondary_bg_color);
  if (p.text_color) root.style.setProperty("--text", p.text_color);
  if (p.hint_color) root.style.setProperty("--text-dim", p.hint_color);
  if (p.button_color) root.style.setProperty("--accent", p.button_color);
  if (p.section_separator_color) root.style.setProperty("--border", p.section_separator_color);
}