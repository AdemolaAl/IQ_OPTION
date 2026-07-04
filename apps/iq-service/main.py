from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from iqoptionapi.stable_api import IQ_Option
import os

app = FastAPI()

# One connection per process for now — later, one per user
iq: IQ_Option | None = None

class LoginBody(BaseModel):
    email: str
    password: str
    account_type: str = "PRACTICE"  # or "REAL"

class OrderBody(BaseModel):
    asset: str          # e.g. "EURUSD"
    amount: float       # in account currency
    direction: str      # "call" or "put"
    duration: int       # minutes: 1, 5, 15...

@app.post("/login")
def login(body: LoginBody):
    global iq
    iq = IQ_Option(body.email, body.password)
    check, reason = iq.connect()
    if not check:
        raise HTTPException(401, f"login failed: {reason}")
    iq.change_balance(body.account_type)
    return {"ok": True, "balance": iq.get_balance()}

@app.get("/balance")
def balance():
    if not iq: raise HTTPException(400, "not logged in")
    return {"balance": iq.get_balance()}

@app.post("/order")
def order(body: OrderBody):
    if not iq: raise HTTPException(400, "not logged in")
    ok, order_id = iq.buy(body.amount, body.asset, body.direction, body.duration)
    if not ok:
        raise HTTPException(400, "order rejected")
    return {"order_id": order_id}

@app.get("/order/{order_id}")
def order_result(order_id: int):
    if not iq: raise HTTPException(400, "not logged in")
    # blocks until result — in production, poll or use a job queue
    result, profit = iq.check_win_v4(order_id)
    return {"result": result, "profit": profit}