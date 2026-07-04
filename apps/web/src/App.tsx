import { useEffect, useState } from "react";

type User = { id: number; first_name: string; username?: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<string>("starting");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      setStatus("Telegram SDK not loaded (open via bot, not browser)");
      return;
    }

    tg.ready();
    tg.expand();

    setStatus(`initData length: ${tg.initData.length}`);

    if (!tg.initData) {
      setStatus("No initData — not launched from Telegram");
      return;
    }

    fetch(`${import.meta.env.VITE_API_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
        return r.json();
      })
      .then((d) => {
        setUser(d.user);
        setStatus("ok");
      })
      .catch((e) => setStatus(`fetch error: ${e.message}`));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Telegram Mini App</h1>
      <p style={{ opacity: 0.6, fontSize: 12 }}>Status: {status}</p>
      {user && (
        <div>
          <p>👋 Hello, <b>{user.first_name}</b></p>
          <p>ID: {user.id}</p>
          {user.username && <p>@{user.username}</p>}
        </div>
      )}
    </div>
  );
}