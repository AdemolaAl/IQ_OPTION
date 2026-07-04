import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        initData: string;
        HapticFeedback: { impactOccurred: (style: string) => void; notificationOccurred: (t: string) => void };
        themeParams: Record<string, string>;
      };
    };
  }
}

const API = import.meta.env.VITE_API_URL;

type TgUser = { id: number; first_name: string; username?: string };
type Screen = "loading" | "iq-login" | "dashboard";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) { setError("Open this inside Telegram"); return; }
    tg.ready();
    tg.expand();

    if (!tg.initData) { setError("No initData — open via bot button"); return; }

    fetch(`${API}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error)))
      .then(d => { setTgUser(d.user); setScreen("iq-login"); })
      .catch(e => setError(String(e)));
  }, []);

  if (error) return <Shell><ErrorBox msg={error} /></Shell>;
  if (screen === "loading") return <Shell><p>Loading…</p></Shell>;

  return (
    <Shell>
      <Header user={tgUser} />
      {screen === "iq-login" && <IqLogin onSuccess={() => setScreen("dashboard")} />}
      {screen === "dashboard" && <Dashboard onLogout={() => setScreen("iq-login")} />}
    </Shell>
  );
}

// ---------------- IQ Login ----------------
function IqLogin({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"PRACTICE" | "REAL">("PRACTICE");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/iq/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, account_type: accountType }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || "login failed");
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      onSuccess();
    } catch (e: any) {
      setErr(e.message);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("error");
    } finally { setLoading(false); }
  };

  return (
    <Card title="Connect IQ Option">
      <Warning>Use a demo account. Never share real credentials with untrusted apps.</Warning>
      <Field label="Email">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Password">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Account">
        <div style={{ display: "flex", gap: 8 }}>
          {(["PRACTICE", "REAL"] as const).map(t => (
            <button key={t} onClick={() => setAccountType(t)}
              style={{ ...toggleStyle, ...(accountType === t ? activeToggle : {}) }}>
              {t === "PRACTICE" ? "Demo" : "Real"}
            </button>
          ))}
        </div>
      </Field>
      {err && <ErrorBox msg={err} />}
      <button onClick={submit} disabled={loading || !email || !password} style={primaryBtn}>
        {loading ? "Connecting…" : "Connect"}
      </button>
    </Card>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [asset, setAsset] = useState("EURUSD");
  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadBalance = async () => {
    try {
      const r = await fetch(`${API}/api/iq/balance`);
      const d = await r.json();
      setBalance(d.balance);
    } catch (e: any) { setMessage({ type: "err", text: e.message }); }
  };

  useEffect(() => { loadBalance(); }, []);

  const trade = async (direction: "call" | "put") => {
    setPlacing(true); setMessage(null);
    try {
      const r = await fetch(`${API}/api/iq/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, amount, direction, duration }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "order failed");
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      setMessage({ type: "ok", text: `Order placed: #${d.order_id}` });
      loadBalance();
    } catch (e: any) {
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("error");
      setMessage({ type: "err", text: e.message });
    } finally { setPlacing(false); }
  };

  return (
    <>
      <Card title="Balance">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {balance === null ? "…" : `$${balance.toFixed(2)}`}
          </div>
          <button onClick={loadBalance} style={secondaryBtn}>Refresh</button>
        </div>
      </Card>

      <Card title="Place Trade">
        <Field label="Asset">
          <select value={asset} onChange={e => setAsset(e.target.value)} style={inputStyle}>
            {["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "EURJPY"].map(a => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={`Amount ($${amount})`}>
          <input type="number" min={1} value={amount}
            onChange={e => setAmount(Math.max(1, Number(e.target.value)))} style={inputStyle} />
        </Field>
        <Field label={`Expiry (${duration} min)`}>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 5, 15].map(m => (
              <button key={m} onClick={() => setDuration(m)}
                style={{ ...toggleStyle, ...(duration === m ? activeToggle : {}) }}>
                {m}m
              </button>
            ))}
          </div>
        </Field>

        {message && (
          <div style={{
            padding: 12, borderRadius: 8, marginTop: 12,
            background: message.type === "ok" ? "#0f5132" : "#842029",
            color: "white",
          }}>{message.text}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => trade("call")} disabled={placing}
            style={{ ...primaryBtn, background: "#16a34a", flex: 1 }}>
            {placing ? "…" : "▲ CALL"}
          </button>
          <button onClick={() => trade("put")} disabled={placing}
            style={{ ...primaryBtn, background: "#dc2626", flex: 1 }}>
            {placing ? "…" : "▼ PUT"}
          </button>
        </div>
      </Card>

      <button onClick={onLogout} style={{ ...secondaryBtn, width: "100%", marginTop: 16 }}>
        Disconnect
      </button>
    </>
  );
}

// ---------------- Building blocks ----------------
function Shell({ children }: { children: React.ReactNode }) {
  const tg = window.Telegram?.WebApp;
  const bg = tg?.themeParams?.bg_color ?? "#f7f7f7";
  const text = tg?.themeParams?.text_color ?? "#111";
  return (
    <div style={{
      minHeight: "100vh", background: bg, color: text,
      fontFamily: "system-ui, -apple-system, sans-serif", padding: 16,
    }}>{children}</div>
  );
}

function Header({ user }: { user: TgUser | null }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>Signed in as</div>
      <div style={{ fontWeight: 600 }}>{user?.first_name} {user?.username && `@${user.username}`}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 12, padding: 16, marginBottom: 12,
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", color: "#111",
    }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, marginBottom: 4, opacity: 0.8 }}>{label}</label>
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ padding: 12, background: "#842029", color: "white", borderRadius: 8, marginTop: 8 }}>{msg}</div>;
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 10, background: "#fff3cd", color: "#664d03", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ddd",
  borderRadius: 8, fontSize: 16, boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: 14, background: "#2481cc", color: "white",
  border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px", background: "#e9ecef", color: "#111",
  border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer",
};
const toggleStyle: React.CSSProperties = {
  flex: 1, padding: 10, background: "#f1f3f5", border: "1px solid #dee2e6",
  borderRadius: 8, fontSize: 14, cursor: "pointer",
};
const activeToggle: React.CSSProperties = {
  background: "#2481cc", color: "white", borderColor: "#2481cc",
};