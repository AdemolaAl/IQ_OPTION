const IQ_SERVICE_URL = process.env.IQ_SERVICE_URL!;
const INTERNAL_KEY = process.env.INTERNAL_KEY!;

async function call(path: string, body: any) {
  const r = await fetch(`${IQ_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": INTERNAL_KEY },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { detail: text }; }
  return { ok: r.ok, status: r.status, data };
}

export const iqClient = {
  login: (userId: string, email: string, password: string, accountType = "PRACTICE") =>
    call("/login", { user_id: userId, email, password, account_type: accountType }),
  balance: (userId: string) => call("/balance", { user_id: userId }),
  placeOrder: (userId: string, asset: string, amount: number, direction: "call" | "put", duration: number) =>
    call("/order", { user_id: userId, asset, amount, direction, duration }),
  logout: (userId: string) => call("/logout", { user_id: userId }),
};