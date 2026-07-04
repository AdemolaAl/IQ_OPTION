const IQ_SERVICE_URL = "http://localhost:8000";

export const iqClient = {
  async login(email: string, password: string, accountType = "PRACTICE") {
    const r = await fetch(`${IQ_SERVICE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, account_type: accountType }),
    });
    if (!r.ok) throw new Error(`login failed: ${await r.text()}`);
    return r.json() as Promise<{ ok: boolean; balance: number }>;
  },

  async balance() {
    const r = await fetch(`${IQ_SERVICE_URL}/balance`);
    return r.json() as Promise<{ balance: number }>;
  },

  async placeOrder(asset: string, amount: number, direction: "call" | "put", duration: number) {
    const r = await fetch(`${IQ_SERVICE_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, amount, direction, duration }),
    });
    if (!r.ok) throw new Error(`order failed: ${await r.text()}`);
    return r.json() as Promise<{ order_id: number }>;
  },
};