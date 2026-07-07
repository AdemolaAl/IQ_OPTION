import { useEffect, useState, useCallback } from "react";
import clsx from "clsx";
import { api, setToken, type TgUser } from "./api";
import "./index.css";

declare global {
  interface Window {
    Telegram?: { WebApp: {
      ready: () => void; expand: () => void; initData: string;
      HapticFeedback: { impactOccurred: (s: string) => void; notificationOccurred: (t: string) => void };
    }};
  }
}

const haptic = {
  tap: () => window.Telegram?.WebApp.HapticFeedback.impactOccurred("light"),
  ok: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success"),
  err: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred("error"),
};

type Me = TgUser & { hasAccess: boolean; isAdmin: boolean; autoTrade: boolean; autoAmount: number };
type Stage = "boot" | "access" | "granted" | "iq-login" | "app";
type Tab = "home" | "signals" | "trade";
type Toast = { id: number; type: "ok" | "err"; text: string };

export default function App() {
  const [stage, setStage] = useState<Stage>("boot");
  const [tab, setTab] = useState<Tab>("home");
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balPop, setBalPop] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: "ok" | "err", text: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const { balance } = await api.iqBalance();
      setBalance(balance);
      setBalPop(true); setTimeout(() => setBalPop(false), 500);
    } catch { /* not connected yet */ }
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) { setBootError("Open this app inside Telegram"); return; }
    tg.ready(); tg.expand();
    if (!tg.initData) { setBootError("Open via the bot button"); return; }

    api.auth(tg.initData)
      .then((d) => {
        setToken(d.token);
        setMe(d.user as Me);
        setStage(d.user.hasAccess ? "iq-login" : "access");
      })
      .catch((e) => setBootError(e.message));
  }, []);

  if (bootError) return <div className="splash"><div><div style={{fontSize:40}}>⚠️</div><b>{bootError}</b></div></div>;
  if (stage === "boot") return <div className="splash"><div><div className="spinner" /><b>Loading iqbotix…</b></div></div>;

  if (stage === "access") return (
    <>
      <ToastStack toasts={toasts} />
      <AccessGate onGranted={() => { haptic.ok(); setStage("granted"); setTimeout(() => setStage("iq-login"), 1800); }}
        onError={(m) => { haptic.err(); toast("err", m); }} />
    </>
  );

  if (stage === "granted") return (
    <div className="splash"><div className="granted">
      <div className="big">✅</div>
      <div className="t">Access granted</div>
      <div className="note">Setting things up…</div>
    </div></div>
  );

  if (stage === "iq-login") return (
    <>
      <ToastStack toasts={toasts} />
      <IqLogin onDone={(bal) => { haptic.ok(); setBalance(bal); setStage("app"); toast("ok", "Connected to IQ Option"); }}
        onError={(m) => { haptic.err(); toast("err", m); }} />
    </>
  );

  // ====== main app ======
  return (
    <>
      <ToastStack toasts={toasts} />
      <div className="appbar">
        <div className="logo">iQ</div>
        <div>
          <h1>iqbotix</h1>
          <div className="sub">Hi, {me?.first_name} 👋</div>
        </div>
        <div className="bal" onClick={() => { haptic.tap(); refreshBalance(); }}>
          <div className={clsx("n", balPop && "pop")}>{balance === null ? "—" : `$${balance.toFixed(2)}`}</div>
          <div className="l">Balance · tap ↻</div>
        </div>
      </div>

      {tab === "home" && <Home me={me!} balance={balance} onGoTrade={() => setTab("trade")} onGoSignals={() => setTab("signals")} />}
      {tab === "signals" && <Signals me={me!} toast={toast} onTraded={refreshBalance} onSettingsChange={(s) => setMe((m) => m ? { ...m, ...s } : m)} />}
      {tab === "trade" && <Trade toast={toast} onTraded={refreshBalance} />}

      <div className="tabbar">
        {([["home","🏠","Home"],["signals","📡","Signals"],["trade","📈","Trade"]] as const).map(([k, ic, lab]) => (
          <button key={k} className={clsx("tab", tab === k && "on")}
            onClick={() => { haptic.tap(); setTab(k); }}>
            <span className="ic">{ic}</span>{lab}
          </button>
        ))}
      </div>
    </>
  );
}

/* ============ ONBOARDING ============ */
function AccessGate({ onGranted, onError }: { onGranted: () => void; onError: (m: string) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (code.trim().length < 4) return onError("Enter a valid access code");
    setLoading(true);
    try { await api.verifyAccess(code); onGranted(); }
    catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="ob">
      <div className="ob-hero">
        <div className="ob-logo">iQ</div>
        <div className="ob-title">Welcome to iqbotix</div>
        <div className="ob-sub">Enter your access code to continue.<br />No code yet? Message the bot and the team will send you one.</div>
      </div>
      <div className="card">
        <div className="field">
          <label className="field-label">Access code</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. WELCOME2026" autoCapitalize="characters"
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <button className="btn" onClick={submit} disabled={loading || !code}>
          {loading ? "Checking…" : "Unlock →"}
        </button>
      </div>
    </div>
  );
}

function IqLogin({ onDone, onError }: { onDone: (balance: number) => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [accountType, setAccountType] = useState<"PRACTICE" | "REAL">("PRACTICE");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try { const r = await api.iqConnect(email, password, accountType); onDone(r.balance); }
    catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="ob">
      <div className="ob-hero">
        <div className="ob-logo">iQ</div>
        <div className="ob-title">Connect IQ Option</div>
        <div className="ob-sub">Your password goes straight to IQ Option — we never store it.</div>
      </div>

      <div className="alert-warn">⚠️ <span>Use a <b>demo account</b> while getting familiar. Trading involves risk.</span></div>

      <div className="card">
        <div className="field">
          <label className="field-label">Email</label>
          <input className="input" type="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <div style={{ position: "relative" }}>
            <input className="input" type={showPwd ? "text" : "password"} placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 46 }} />
            <button style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}
              onClick={() => setShowPwd((s) => !s)}>{showPwd ? "🙈" : "👁️"}</button>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Account</label>
          <div className="segmented">
            {(["PRACTICE", "REAL"] as const).map((t) => (
              <button key={t} className={clsx("seg", accountType === t && "active")}
                onClick={() => { haptic.tap(); setAccountType(t); }}>
                {t === "PRACTICE" ? "Demo" : "Real"}
              </button>
            ))}
          </div>
        </div>
        <button className="btn dark" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Connecting…" : "Log in & launch 🚀"}
        </button>
      </div>
    </div>
  );
}

/* ============ HOME ============ */
function Home({ me, balance, onGoTrade, onGoSignals }: {
  me: Me; balance: number | null; onGoTrade: () => void; onGoSignals: () => void;
}) {
  return (
    <div className="screen">
      <div className="eyebrow">Dashboard</div>
      <div className="h2">Good to see you, {me.first_name}</div>
      <div className="lead">Your trading hub — signals, manual trades, and your account at a glance.</div>

      <div className="statrow">
        <div className="stat"><div className="v">{balance === null ? "—" : `$${balance.toFixed(2)}`}</div><div className="k">Balance</div></div>
        <div className="stat"><div className="v">{me.autoTrade ? "AUTO" : "MANUAL"}</div><div className="k">Signal mode</div></div>
      </div>

      <div className="card" onClick={onGoSignals} style={{ cursor: "pointer" }}>
        <div className="h2" style={{ fontSize: 17 }}>📡 Live signals</div>
        <div className="note" style={{ padding: "4px 0 0" }}>See active signals and take them with one tap — or switch on auto mode.</div>
      </div>

      <div className="card" onClick={onGoTrade} style={{ cursor: "pointer" }}>
        <div className="h2" style={{ fontSize: 17 }}>📈 Manual trade</div>
        <div className="note" style={{ padding: "4px 0 0" }}>Pick an asset, set your stake and expiry, and place CALL or PUT yourself.</div>
      </div>

      <div className="note">Signals are ideas, not guarantees — any trade can lose. Trade amounts you can afford.</div>
    </div>
  );
}

/* ============ SIGNALS ============ */
type Sig = { id: string; asset: string; direction: string; duration: number; executeAt: string | null; createdAt: string };

function Signals({ me, toast, onTraded, onSettingsChange }: {
  me: Me;
  toast: (t: "ok" | "err", m: string) => void;
  onTraded: () => void;
  onSettingsChange: (s: { autoTrade: boolean; autoAmount: number }) => void;
}) {
  const [signals, setSignals] = useState<Sig[]>([]);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState<string | null>(null);

  const load = useCallback(() => {
    api.activeSignals().then(setSignals).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // refresh every 15s
    return () => clearInterval(t);
  }, [load]);

  const take = async (s: Sig) => {
    setTaking(s.id);
    try {
      const r = await api.takeSignal(s.id, me.autoAmount);
      haptic.ok(); toast("ok", `Trade placed · #${r.order_id}`); onTraded();
    } catch (e: any) { haptic.err(); toast("err", e.message); }
    finally { setTaking(null); }
  };

  const setMode = async (autoTrade: boolean) => {
    haptic.tap();
    const r = await api.updateSettings({ autoTrade });
    onSettingsChange(r);
    toast("ok", autoTrade ? "Auto-trading ON — signals execute automatically" : "Manual mode — you approve each signal");
  };

  const setStake = async (autoAmount: number) => {
    haptic.tap();
    const r = await api.updateSettings({ autoAmount });
    onSettingsChange(r);
  };

  return (
    <div className="screen">
      <div className="eyebrow">Signals</div>
      <div className="h2">Live signals</div>
      <div className="lead">New signals appear here and in your Telegram chat.</div>

      {me.autoTrade && (
        <div className="auto-banner">
          <div style={{ fontSize: 22 }}>⚡</div>
          <div><b>AUTO MODE ON</b><span>Signals execute automatically with ${me.autoAmount} stake</span></div>
        </div>
      )}

      <div className="card">
        <div className="field" style={{ marginBottom: 10 }}>
          <label className="field-label">Signal mode</label>
          <div className="segmented">
            <button className={clsx("seg", !me.autoTrade && "active")} onClick={() => setMode(false)}>Manual</button>
            <button className={clsx("seg", me.autoTrade && "active")} onClick={() => setMode(true)}>Auto</button>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Stake per signal — ${me.autoAmount}</label>
          <div className="chips">
            {[1, 5, 10, 25, 50].map((v) => (
              <button key={v} className={clsx("chip", me.autoAmount === v && "active")} onClick={() => setStake(v)}>${v}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="note">Loading signals…</div>}
      {!loading && signals.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📡</div>
          <b>No active signals right now</b>
          <div className="note">You'll get a Telegram message the moment one drops.</div>
        </div>
      )}

      {signals.map((s) => (
        <div key={s.id} className={clsx("sig-card", s.direction)}>
          <div className="sig-head">
            <div className="sig-asset">{s.asset}</div>
            <div className={clsx("sig-dir", s.direction)}>{s.direction === "call" ? "▲ CALL" : "▼ PUT"}</div>
          </div>
          <div className="sig-meta">
            {s.duration}m expiry · {s.executeAt ? `⏰ ${new Date(s.executeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "⚡ live now"}
          </div>
          {!me.autoTrade && (
            <button className={clsx("btn", s.direction === "call" ? "up" : "down")}
              onClick={() => take(s)} disabled={taking === s.id}>
              {taking === s.id ? "Placing…" : `Take · $${me.autoAmount}`}
            </button>
          )}
          {me.autoTrade && <div className="note" style={{ padding: 0 }}>Will auto-execute for you ⚡</div>}
        </div>
      ))}

      <div className="note"><b>Note:</b> signals are ideas, not guarantees — any trade can lose. You control your stake.</div>
    </div>
  );
}

/* ============ MANUAL TRADE ============ */
function Trade({ toast, onTraded }: { toast: (t: "ok" | "err", m: string) => void; onTraded: () => void }) {
  const [assets, setAssets] = useState<string[]>([]);
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(1);
  const [placing, setPlacing] = useState<"call" | "put" | null>(null);

  useEffect(() => {
    api.iqAssets().then((d) => {
      const uniq = [...new Set(d.assets.map((a) => a.asset))];
      setAssets(uniq);
      if (uniq.length) setAsset(uniq[0]);
    }).catch(() => {});
  }, []);

  const trade = async (direction: "call" | "put") => {
    setPlacing(direction);
    try {
      const r = await api.iqOrder(asset, amount, direction, duration);
      haptic.ok(); toast("ok", `${direction.toUpperCase()} placed · #${r.order_id}`); onTraded();
    } catch (e: any) { haptic.err(); toast("err", e.message); }
    finally { setPlacing(null); }
  };

  return (
    <div className="screen">
      <div className="eyebrow">Manual</div>
      <div className="h2">Place a trade</div>
      <div className="lead">Only assets open for trading right now are shown.</div>

      <div className="card">
        <div className="field">
          <label className="field-label">Asset</label>
          <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)}>
            {assets.length === 0 && <option>Loading…</option>}
            {assets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Amount — ${amount}</label>
          <div className="amount-row">
            <button className="stepper" onClick={() => { haptic.tap(); setAmount((a) => Math.max(1, a - 1)); }}>−</button>
            <input className="input" type="number" min={1} value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} />
            <button className="stepper" onClick={() => { haptic.tap(); setAmount((a) => a + 1); }}>+</button>
          </div>
          <div className="chips">
            {[1, 5, 10, 25, 50].map((v) => (
              <button key={v} className={clsx("chip", amount === v && "active")}
                onClick={() => { haptic.tap(); setAmount(v); }}>${v}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Expiry</label>
          <div className="segmented">
            {[1, 5, 15].map((d) => (
              <button key={d} className={clsx("seg", duration === d && "active")}
                onClick={() => { haptic.tap(); setDuration(d); }}>{d}m</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button className="btn up" onClick={() => trade("call")} disabled={placing !== null || !asset}>
            {placing === "call" ? "…" : "▲ CALL"}
          </button>
          <button className="btn down" onClick={() => trade("put")} disabled={placing !== null || !asset}>
            {placing === "put" ? "…" : "▼ PUT"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ TOASTS ============ */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={clsx("toast", t.type)}>
          <span>{t.type === "ok" ? "✅" : "⚠️"}</span>{t.text}
        </div>
      ))}
    </div>
  );
}