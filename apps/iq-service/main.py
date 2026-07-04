from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from iqoptionapi.stable_api import IQ_Option
from threading import Lock
import os
import time

app = FastAPI()

INTERNAL_KEY = os.environ["INTERNAL_KEY"]

# user_id -> { "iq": IQ_Option, "last_used": float, "lock": Lock }
_sessions: dict[str, dict] = {}
_pool_lock = Lock()

SESSION_TTL = 60 * 60  # 1 hour idle timeout

def require_internal(x_internal_key: str | None):
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(403, "forbidden")

def sweep_expired():
    now = time.time()
    with _pool_lock:
        stale = [uid for uid, s in _sessions.items() if now - s["last_used"] > SESSION_TTL]
        for uid in stale:
            _sessions.pop(uid, None)

def get_session(user_id: str) -> IQ_Option:
    sweep_expired()
    with _pool_lock:
        s = _sessions.get(user_id)
    if not s or not s["iq"].check_connect():
        raise HTTPException(401, "not connected")
    s["last_used"] = time.time()
    return s["iq"]

def get_lock(user_id: str) -> Lock:
    with _pool_lock:
        return _sessions[user_id]["lock"]

class LoginBody(BaseModel):
    user_id: str
    email: str
    password: str
    account_type: str = "PRACTICE"

@app.post("/login")
def login(body: LoginBody, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    iq = IQ_Option(body.email, body.password)
    ok, reason = iq.connect()
    if not ok:
        raise HTTPException(401, f"login failed: {reason}")
    iq.change_balance(body.account_type)
    with _pool_lock:
        _sessions[body.user_id] = {
            "iq": iq,
            "last_used": time.time(),
            "lock": Lock(),
        }
    return {"ok": True, "balance": iq.get_balance()}

class ByUser(BaseModel):
    user_id: str

@app.post("/balance")
def balance(body: ByUser, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    iq = get_session(body.user_id)
    return {"balance": iq.get_balance()}

class OrderBody(BaseModel):
    user_id: str
    asset: str
    amount: float
    direction: str
    duration: int

@app.post("/order")
def order(body: OrderBody, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    iq = get_session(body.user_id)
    lock = get_lock(body.user_id)
    with lock:  # serialize orders per user
        ok, order_id = iq.buy(body.amount, body.asset, body.direction, body.duration)
    if not ok:
        raise HTTPException(400, "order rejected")
    return {"order_id": order_id}

@app.post("/logout")
def logout(body: ByUser, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    with _pool_lock:
        _sessions.pop(body.user_id, None)
    return {"ok": True}

@app.get("/status")
def status(x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    sweep_expired()
    with _pool_lock:
        return {"active_sessions": len(_sessions)}