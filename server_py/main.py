from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os, time, secrets, json
from sqlalchemy import create_engine, String, Integer, Float, Text, ForeignKey, select, func, and_, asc, desc, JSON as SAJSON, text as sql_text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, Session as SASession
from sqlalchemy.dialects.postgresql import JSONB
from dotenv import load_dotenv
import logging
from sqlalchemy.engine import make_url
from collections import defaultdict
import anyio
import asyncio

load_dotenv()

DATABASE_URL_ENV = os.getenv("DATABASE_URL")

def _with_connect_timeout(url: str, seconds: int = 2) -> str:
    if not url:
        return url
    try:
        u = make_url(url)
        if u.get_backend_name().startswith('postgresql'):
            q = dict(u.query)
            if 'connect_timeout' not in q:
                q['connect_timeout'] = str(seconds)
            u = u.set(query=q)
            return str(u)
    except Exception:
        pass
    if 'postgresql' in url and 'connect_timeout=' not in url:
        sep = '&' if ('?' in url) else '?'
        return f"{url}{sep}connect_timeout={seconds}"
    return url

def make_engine():
    # Try Postgres (or provided URL) first
    if DATABASE_URL_ENV:
        try:
            url = _with_connect_timeout(DATABASE_URL_ENV, 2)
            eng = create_engine(url, echo=False, future=True)
            # test connection
            with eng.connect() as conn:
                conn.execute(sql_text("SELECT 1"))
            return eng
        except Exception as e:
            logging.warning(f"Failed to connect to DATABASE_URL, falling back to SQLite. Error: {e}")
    # Fallback to local SQLite
    return create_engine("sqlite+pysqlite:///./server_py/app.db", echo=False, future=True)

engine = make_engine()
logging.basicConfig(level=logging.INFO)
logging.getLogger("sqlalchemy.engine").disabled = True

class Base(DeclarativeBase):
    pass

# SQLAlchemy models
class TariffModel(Base):
    __tablename__ = "tariff"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    base: Mapped[int] = mapped_column(Integer)
    perKm: Mapped[int] = mapped_column(Integer)
    per3min: Mapped[int] = mapped_column(Integer)

class UserModel(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(32), default="customer")
    createdAt: Mapped[int] = mapped_column(Integer)

class SessionModel(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    userId: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"))
    createdAt: Mapped[int] = mapped_column(Integer)
    expiresAt: Mapped[int] = mapped_column(Integer)

class AuthCodeModel(Base):
    __tablename__ = "auth_codes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    code: Mapped[str] = mapped_column(String(8))
    createdAt: Mapped[int] = mapped_column(Integer)
    expiresAt: Mapped[int] = mapped_column(Integer)

class OrderModel(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    createdAt: Mapped[int] = mapped_column(Integer, index=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fromAddress: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    toAddress: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    startCoords: Mapped[Optional[dict]] = mapped_column(SAJSON().with_variant(JSONB, "postgresql"), nullable=True)
    destCoords: Mapped[Optional[dict]] = mapped_column(SAJSON().with_variant(JSONB, "postgresql"), nullable=True)
    distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    finalCost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(SAJSON().with_variant(JSONB, "postgresql"), nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(SAJSON().with_variant(JSONB, "postgresql"), nullable=True)
    userId: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

class SettingsModel(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)
    value: Mapped[Optional[dict]] = mapped_column(SAJSON().with_variant(JSONB, "postgresql"), nullable=True)

class DriverModel(Base):
    __tablename__ = "drivers"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    phone: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200), default="")
    car: Mapped[str] = mapped_column(String(200), default="")
    plate: Mapped[str] = mapped_column(String(64), default="")
    createdAt: Mapped[int] = mapped_column(Integer)

class MessageModel(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    userId: Mapped[str] = mapped_column(String(32), index=True)
    sender: Mapped[str] = mapped_column(String(16))  # 'user' | 'admin'
    text: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[int] = mapped_column(Integer, index=True)

# Pydantic models for IO (compatible with previous API)
class Tariff(BaseModel):
    base: int
    perKm: int
    per3min: int

class OrderDetails(BaseModel):
    driverName: Optional[str] = ""
    vehicleMake: Optional[str] = ""
    vehicleModel: Optional[str] = ""
    plateNumber: Optional[str] = ""
    vehicleColor: Optional[str] = ""
    notes: Optional[str] = ""
    startedAt: Optional[str] = None
    arrivedAt: Optional[str] = None
    customerName: Optional[str] = ""

class Order(BaseModel):
    id: str
    createdAt: int
    address: Optional[str] = None
    fromAddress: Optional[str] = None
    toAddress: Optional[str] = None
    startCoords: Optional[Dict[str, Any]] = None
    destCoords: Optional[Dict[str, Any]] = None
    distance: Optional[float] = None
    duration: Optional[float] = None
    cost: Optional[float] = None
    finalCost: Optional[float] = None
    meta: Optional[Dict[str, Any]] = None
    details: OrderDetails = Field(default_factory=OrderDetails)
    userId: Optional[str] = None

class Support(BaseModel):
    phone: str = ""
    email: str = ""

class Info(BaseModel):
    about: str = ""
    version: str = ""
    company: str = ""

class User(BaseModel):
    id: str
    phone: str
    name: str = ""
    role: str = "customer"
    createdAt: int

class Driver(BaseModel):
    id: str
    phone: str
    name: str = ""
    car: str = ""
    plate: str = ""
    createdAt: int

class Message(BaseModel):
    id: str
    userId: str
    sender: str
    text: str
    createdAt: int

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

def get_token(req: Request) -> Optional[str]:
    auth = req.headers.get('authorization') or ''
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == 'bearer':
        return parts[1]
    return None

def norm_phone(p: Optional[str]) -> str:
    if not p:
        return ''
    # keep only digits; treat all formats equally
    return ''.join(ch for ch in str(p) if ch.isdigit())

def get_session_user(db: SASession, token: Optional[str]) -> Optional[UserModel]:
    if not token:
        return None
    now = int(time.time() * 1000)
    sess = db.get(SessionModel, token)
    if not sess or sess.expiresAt <= now:
        return None
    return db.get(UserModel, sess.userId)

def ensure_defaults():
    Base.metadata.create_all(engine)
    with SASession(engine) as s:
        # tariff
        if s.scalar(select(func.count()).select_from(TariffModel)) == 0:
            s.add(TariffModel(base=600, perKm=40, per3min=10))
        # settings keys
        for k, default in {
            "support": {"phone": "", "email": ""},
            "info": {"about": "", "version": "", "company": ""},
        }.items():
            if s.scalar(select(func.count()).select_from(SettingsModel).where(SettingsModel.key == k)) == 0:
                s.add(SettingsModel(key=k, value=default))
        s.commit()

ensure_defaults()
logging.info(f"API DB connected: dialect={engine.dialect.name} url={str(engine.url).split('@')[0]}@***")

# In-memory WS connections registry: userId -> set[WebSocket]
ws_clients: Dict[str, set] = defaultdict(set)

async def _broadcast_to(uid: str, payload: Dict[str, Any]):
    # Send to user's sockets
    for client in list(ws_clients.get(uid, set())):
        try:
            await client.send_json(payload)
        except Exception:
            try:
                ws_clients[uid].discard(client)
            except Exception:
                pass
    # Send to admin listeners
    admin_uid = '__admin__'
    for client in list(ws_clients.get(admin_uid, set())):
        try:
            await client.send_json(payload)
        except Exception:
            try:
                ws_clients[admin_uid].discard(client)
            except Exception:
                pass

@app.get('/db')
def db_info():
    try:
        with engine.connect() as conn:
            ver = None
            if engine.dialect.name == 'postgresql':
                ver = conn.execute(sql_text('select version()')).scalar()
            elif engine.dialect.name == 'sqlite':
                ver = conn.execute(sql_text('select sqlite_version()')).scalar()
            return {
                "dialect": engine.dialect.name,
                "url": f"{str(engine.url).split('@')[0]}@***",
                "version": ver
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/health')
def health():
    return {"ok": True}

@app.get('/tariff')
def get_tariff():
    with SASession(engine) as s:
        t = s.scalars(select(TariffModel)).first()
        return Tariff(base=t.base, perKm=t.perKm, per3min=t.per3min)

@app.put('/tariff')
def put_tariff(t: Tariff):
    with SASession(engine) as s:
        rec = s.scalars(select(TariffModel)).first()
        if not rec:
            rec = TariffModel(base=t.base, perKm=t.perKm, per3min=t.per3min)
            s.add(rec)
        else:
            rec.base = t.base
            rec.perKm = t.perKm
            rec.per3min = t.per3min
        s.commit()
        return t

@app.get('/orders')
def list_orders():
    with SASession(engine) as s:
        rows = s.scalars(select(OrderModel).order_by(desc(OrderModel.createdAt))).all()
        def to_order(m: OrderModel) -> Order:
            details = (m.details or {})
            return Order(
                id=m.id,
                createdAt=m.createdAt,
                address=m.address,
                fromAddress=m.fromAddress,
                toAddress=m.toAddress,
                startCoords=m.startCoords,
                destCoords=m.destCoords,
                distance=m.distance,
                duration=m.duration,
                cost=m.cost,
                finalCost=m.finalCost,
                meta=m.meta,
                details=OrderDetails(**details) if isinstance(details, dict) else OrderDetails(),
                userId=m.userId,
            )
        return [to_order(r) for r in rows]

@app.post('/orders')
def create_order(payload: Dict[str, Any], req: Request):
    with SASession(engine) as s:
        user = get_session_user(s, get_token(req))
        if not user:
            raise HTTPException(status_code=401, detail='unauthorized')
        payload = dict(payload or {})
        payload.pop('userId', None)
        details = payload.get('details') or {}
        details['customerName'] = user.name or ''
        now = int(time.time()*1000)
        order = OrderModel(
            id=secrets.token_hex(8),
            createdAt=now,
            address=payload.get('address'),
            fromAddress=payload.get('fromAddress'),
            toAddress=payload.get('toAddress'),
            startCoords=payload.get('startCoords'),
            destCoords=payload.get('destCoords'),
            distance=payload.get('distance'),
            duration=payload.get('duration'),
            cost=payload.get('cost'),
            finalCost=payload.get('finalCost'),
            meta=payload.get('meta'),
            details=details,
            userId=user.id,
        )
        s.add(order)
        s.commit()
        return get_order(order.id)

@app.delete('/orders')
def clear_orders():
    with SASession(engine) as s:
        s.query(OrderModel).delete()
        s.commit()
        return {"ok": True}

@app.get('/orders/{oid}')
def get_order(oid: str):
    with SASession(engine) as s:
        m = s.get(OrderModel, oid)
        if not m:
            raise HTTPException(status_code=404, detail='not_found')
        details = (m.details or {})
        return Order(
            id=m.id,
            createdAt=m.createdAt,
            address=m.address,
            fromAddress=m.fromAddress,
            toAddress=m.toAddress,
            startCoords=m.startCoords,
            destCoords=m.destCoords,
            distance=m.distance,
            duration=m.duration,
            cost=m.cost,
            finalCost=m.finalCost,
            meta=m.meta,
            details=OrderDetails(**details) if isinstance(details, dict) else OrderDetails(),
            userId=m.userId,
        )

@app.put('/orders/{oid}')
def update_order(oid: str, payload: Dict[str, Any]):
    with SASession(engine) as s:
        m = s.get(OrderModel, oid)
        if not m:
            raise HTTPException(status_code=404, detail='not_found')
        incoming = dict(payload or {})
        incoming.pop('id', None)
        incoming.pop('createdAt', None)
        # userId backfill rule
        if (m.userId is None or m.userId == '') and incoming.get('userId'):
            uid = incoming['userId']
            u = s.get(UserModel, uid)
            if u:
                m.userId = uid
                det = dict(m.details or {})
                det['customerName'] = u.name or ''
                m.details = det
        # merge others
        for k, v in incoming.items():
            if k == 'userId':
                continue
            if hasattr(m, k):
                setattr(m, k, v)
        s.commit()
        return get_order(oid)

@app.get('/settings')
def get_settings():
    with SASession(engine) as s:
        rows = s.scalars(select(SettingsModel)).all()
        out = {r.key: r.value for r in rows}
        return out

@app.put('/settings')
def put_settings(payload: Dict[str, Any]):
    with SASession(engine) as s:
        for k, v in (payload or {}).items():
            rec = s.scalars(select(SettingsModel).where(SettingsModel.key == k)).first()
            if rec:
                rec.value = v
            else:
                s.add(SettingsModel(key=k, value=v))
        s.commit()
        return get_settings()

@app.get('/support')
def get_support():
    with SASession(engine) as s:
        rec = s.scalars(select(SettingsModel).where(SettingsModel.key == 'support')).first()
        return rec.value if rec and rec.value else {"phone": "", "email": ""}

@app.put('/support')
def put_support(payload: Support):
    return put_settings({"support": payload.model_dump()})

@app.get('/info')
def get_info():
    with SASession(engine) as s:
        rec = s.scalars(select(SettingsModel).where(SettingsModel.key == 'info')).first()
        return rec.value if rec and rec.value else {"about": "", "version": "", "company": ""}

@app.put('/info')
def put_info(payload: Info):
    return put_settings({"info": payload.model_dump()})

@app.post('/auth/request-code')
def request_code(payload: Dict[str, Any]):
    raw_phone = (payload or {}).get('phone')
    if not raw_phone:
        raise HTTPException(status_code=400, detail='invalid_phone')
    phone = norm_phone(raw_phone)
    if not phone:
        raise HTTPException(status_code=400, detail='invalid_phone')
    with SASession(engine) as s:
        now = int(time.time()*1000)
        code = f"{secrets.randbelow(9000)+1000}"
        rec = AuthCodeModel(id=secrets.token_hex(8), phone=phone, code=code, createdAt=now, expiresAt=now + 5*60*1000)
        s.add(rec)
        # trim old codes (best-effort)
        cutoff = now - 24*60*60*1000
        try:
            s.query(AuthCodeModel).filter(AuthCodeModel.createdAt < cutoff).delete()
        except Exception:
            pass
        # Determine existence by normalized comparison
        existing = s.scalars(select(UserModel)).all()
        user_exists = any(norm_phone(u.phone) == phone for u in existing)
        s.commit()
        return {"ok": True, "devCode": code, "userExists": user_exists}

@app.post('/auth/verify')
def verify(payload: Dict[str, Any]):
    raw_phone = (payload or {}).get('phone')
    code = (payload or {}).get('code')
    name = (payload or {}).get('name') or ''
    if not raw_phone or not code:
        raise HTTPException(status_code=400, detail='invalid_payload')
    phone = norm_phone(raw_phone)
    if not phone:
        raise HTTPException(status_code=400, detail='invalid_payload')
    now = int(time.time()*1000)
    with SASession(engine) as s:
        logging.info(f"/auth/verify attempt phone={phone} code={code}")
        match = s.scalars(select(AuthCodeModel).where(and_(AuthCodeModel.phone == phone, AuthCodeModel.code == str(code), AuthCodeModel.expiresAt > now))).first()
        if not match:
            # Debug: log available codes for this phone
            try:
                codes = s.scalars(select(AuthCodeModel).where(AuthCodeModel.phone == phone)).all()
                logging.warning(f"/auth/verify code_invalid for phone={phone}. Available codes: {[ (c.code, c.expiresAt, c.createdAt) for c in codes ]}")
            except Exception as e:
                logging.warning(f"/auth/verify code_invalid and failed to list codes: {e}")
            raise HTTPException(status_code=400, detail='code_invalid')
        # Find user by normalized phone
        user = None
        candidates = s.scalars(select(UserModel)).all()
        for u in candidates:
            if norm_phone(u.phone) == phone:
                user = u
                break
        if not user:
            user = UserModel(id=secrets.token_hex(8), phone=phone, name=name, role='customer', createdAt=now)
            s.add(user)
        token = secrets.token_hex(16)
        sess = SessionModel(token=token, userId=user.id, createdAt=now, expiresAt=now + 30*24*60*60*1000)
        s.add(sess)
        # cleanup
        s.query(AuthCodeModel).filter(AuthCodeModel.phone == phone).delete()
        s.commit()
        return {"token": token, "user": User(id=user.id, phone=user.phone, name=user.name, role=user.role, createdAt=user.createdAt)}

@app.get('/me')
def me(req: Request):
    with SASession(engine) as s:
        user = get_session_user(s, get_token(req))
        if not user:
            raise HTTPException(status_code=401, detail='unauthorized')
        return {"user": User(id=user.id, phone=user.phone, name=user.name, role=user.role, createdAt=user.createdAt)}

@app.post('/logout')
def logout(req: Request):
    token = get_token(req)
    with SASession(engine) as s:
        if token:
            sess = s.get(SessionModel, token)
            if sess:
                s.delete(sess)
                s.commit()
    return {"ok": True}

@app.get('/users')
def list_users():
    with SASession(engine) as s:
        rows = s.scalars(select(UserModel).order_by(desc(UserModel.createdAt))).all()
        return [User(id=r.id, phone=r.phone, name=r.name, role=r.role, createdAt=r.createdAt) for r in rows]

@app.get('/users/{uid}')
def get_user(uid: str):
    with SASession(engine) as s:
        u = s.get(UserModel, uid)
        if not u:
            raise HTTPException(status_code=404, detail='not_found')
        return User(id=u.id, phone=u.phone, name=u.name, role=u.role, createdAt=u.createdAt)

@app.delete('/users/{uid}')
def delete_user(uid: str):
    with SASession(engine) as s:
        u = s.get(UserModel, uid)
        if u:
            s.delete(u)
            s.commit()
        return {"ok": True}

@app.get('/users/{uid}/orders')
def user_orders(uid: str):
    with SASession(engine) as s:
        rows = s.scalars(select(OrderModel).where(OrderModel.userId == uid).order_by(desc(OrderModel.createdAt))).all()
        out = []
        for m in rows:
            details = (m.details or {})
            out.append(Order(
                id=m.id,
                createdAt=m.createdAt,
                address=m.address,
                fromAddress=m.fromAddress,
                toAddress=m.toAddress,
                startCoords=m.startCoords,
                destCoords=m.destCoords,
                distance=m.distance,
                duration=m.duration,
                cost=m.cost,
                finalCost=m.finalCost,
                meta=m.meta,
                details=OrderDetails(**details) if isinstance(details, dict) else OrderDetails(),
                userId=m.userId,
            ))
        return out

# --- Chat endpoints ---
@app.get('/users/{uid}/chat')
def get_chat(uid: str):
    with SASession(engine) as s:
        u = s.get(UserModel, uid)
        if not u:
            raise HTTPException(status_code=404, detail='not_found')
        rows = s.scalars(select(MessageModel).where(MessageModel.userId == uid).order_by(asc(MessageModel.createdAt))).all()
        return [Message(id=m.id, userId=m.userId, sender=m.sender, text=m.text, createdAt=m.createdAt) for m in rows]

class SendMessagePayload(BaseModel):
    text: str
    sender: Optional[str] = None  # allow forcing sender for admin

@app.post('/users/{uid}/chat')
async def send_chat_message(uid: str, payload: SendMessagePayload, req: Request):
    with SASession(engine) as s:
        # basic auth: if sender not provided -> infer from token (user). If sender==='admin' allow without token for now.
        sender = payload.sender or 'user'
        if sender == 'user':
            user = get_session_user(s, get_token(req))
            if not user or user.id != uid:
                raise HTTPException(status_code=401, detail='unauthorized')
        else:
            # admin path – allow without auth in this simple setup
            user = s.get(UserModel, uid)
            if not user:
                raise HTTPException(status_code=404, detail='not_found')
        now = int(time.time()*1000)
        msg_id = secrets.token_hex(8)
        text = payload.text or ''
        msg = MessageModel(id=msg_id, userId=uid, sender=sender, text=text, createdAt=now)
        s.add(msg)
        # flush+commit to persist, avoid accessing ORM after commit
        s.flush()
        s.commit()
    # Prepare plain dict without touching expired ORM instance
    out = {"id": msg_id, "userId": uid, "sender": sender, "text": text, "createdAt": now}
    # push to user and admin WS
    await _broadcast_to(uid, {"type":"message","data": out})
    return out

@app.websocket('/ws/user')
async def ws_user(ws: WebSocket):
    await ws.accept()
    try:
        # Expect first message: { token: string }
        auth = await ws.receive_json()
        token = auth.get('token') if isinstance(auth, dict) else None
        if not token:
            await ws.close(code=4401)
            return
        with SASession(engine) as s:
            user = get_session_user(s, token)
            if not user:
                await ws.close(code=4401)
                return
            uid = user.id
        ws_clients[uid].add(ws)
        try:
            while True:
                # user can send messages over WS: { text }
                data = await ws.receive_json()
                text = (data or {}).get('text') or ''
                if not text:
                    continue
                now = int(time.time()*1000)
                msg_id = secrets.token_hex(8)
                with SASession(engine) as s:
                    s.add(MessageModel(id=msg_id, userId=uid, sender='user', text=text, createdAt=now))
                    s.flush(); s.commit()
                # broadcast to same user channel (admin listeners will be separate in UI)
                payload = {"type":"message","data": {"id": msg_id, "userId": uid, "sender": "user", "text": text, "createdAt": now}}
                # to user and admin
                await _broadcast_to(uid, payload)
        except WebSocketDisconnect:
            pass
        finally:
            try:
                ws_clients[uid].discard(ws)
            except Exception:
                pass
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass

@app.websocket('/ws/admin')
async def ws_admin(ws: WebSocket):
    await ws.accept()
    # For simplicity, admin WS receives messages for all users; no auth here
    admin_uid = '__admin__'
    ws_clients[admin_uid].add(ws)
    try:
        while True:
            # Expect { userId, text }
            data = await ws.receive_json()
            uid = (data or {}).get('userId')
            text = (data or {}).get('text')
            if not uid or not text:
                continue
            now = int(time.time()*1000)
            msg_id = secrets.token_hex(8)
            with SASession(engine) as s:
                user = s.get(UserModel, uid)
                if not user:
                    # ignore
                    continue
                s.add(MessageModel(id=msg_id, userId=uid, sender='admin', text=text, createdAt=now))
                s.flush(); s.commit()
            payload = {"type":"message","data": {"id": msg_id, "userId": uid, "sender": "admin", "text": text, "createdAt": now}}
            # push to user's sockets
            for client in list(ws_clients.get(uid, set())):
                try:
                    await client.send_json(payload)
                except Exception:
                    try:
                        ws_clients[uid].discard(client)
                    except Exception:
                        pass
            # also echo back to admin itself
            try:
                await ws.send_json(payload)
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        try:
            ws_clients[admin_uid].discard(ws)
        except Exception:
            pass

# Drivers
@app.get('/drivers')
def list_drivers():
    with SASession(engine) as s:
        rows = s.scalars(select(DriverModel).order_by(desc(DriverModel.createdAt))).all()
        return [Driver(id=r.id, phone=r.phone, name=r.name, car=r.car, plate=r.plate, createdAt=r.createdAt) for r in rows]

@app.post('/drivers')
def create_driver(payload: Dict[str, Any]):
    with SASession(engine) as s:
        now = int(time.time()*1000)
        d = DriverModel(id=secrets.token_hex(8), phone=(payload or {}).get('phone',''), name=(payload or {}).get('name',''), car=(payload or {}).get('car',''), plate=(payload or {}).get('plate',''), createdAt=now)
        s.add(d)
        s.commit()
        return Driver(id=d.id, phone=d.phone, name=d.name, car=d.car, plate=d.plate, createdAt=d.createdAt)

@app.get('/drivers/{did}')
def get_driver(did: str):
    with SASession(engine) as s:
        d = s.get(DriverModel, did)
        if not d:
            raise HTTPException(status_code=404, detail='not_found')
        return Driver(id=d.id, phone=d.phone, name=d.name, car=d.car, plate=d.plate, createdAt=d.createdAt)

@app.put('/drivers/{did}')
def update_driver(did: str, payload: Dict[str, Any]):
    with SASession(engine) as s:
        d = s.get(DriverModel, did)
        if not d:
            raise HTTPException(status_code=404, detail='not_found')
        for k in ['phone','name','car','plate']:
            if k in (payload or {}):
                setattr(d, k, (payload or {})[k])
        s.commit()
        return Driver(id=d.id, phone=d.phone, name=d.name, car=d.car, plate=d.plate, createdAt=d.createdAt)

@app.delete('/drivers/{did}')
def delete_driver(did: str):
    with SASession(engine) as s:
        d = s.get(DriverModel, did)
        if d:
            s.delete(d)
            s.commit()
        return {"ok": True}

@app.on_event("startup")
def startup_import_from_json_if_any():
    # Optional one-time import from server/db.json to bootstrap Postgres/SQLite
    json_path = os.path.join(os.getcwd(), 'server', 'db.json')
    if not os.path.exists(json_path):
        return
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return
    with SASession(engine) as s:
        # only import if users table empty (idempotent-ish)
        if s.scalar(select(func.count()).select_from(UserModel)):
            return
        # users
        for u in data.get('users', []):
            s.merge(UserModel(id=u['id'], phone=u['phone'], name=u.get('name',''), role=u.get('role','customer'), createdAt=u.get('createdAt') or int(time.time()*1000)))
        # sessions are not imported
        # tariff
        t = data.get('tariff') or {}
        rec = s.scalars(select(TariffModel)).first()
        if not rec:
            s.add(TariffModel(base=t.get('base',600), perKm=t.get('perKm',40), per3min=t.get('per3min',10)))
        # settings (upsert by key)
        settings = data.get('settings') or {}
        for k, v in settings.items():
            rec = s.scalars(select(SettingsModel).where(SettingsModel.key == k)).first()
            if rec:
                rec.value = v
            else:
                s.add(SettingsModel(key=k, value=v))
        # orders
        for o in data.get('orders', []):
            s.merge(OrderModel(
                id=o['id'],
                createdAt=o['createdAt'],
                address=o.get('address'),
                fromAddress=o.get('fromAddress'),
                toAddress=o.get('toAddress'),
                startCoords=o.get('startCoords'),
                destCoords=o.get('destCoords'),
                distance=o.get('distance'),
                duration=o.get('duration'),
                cost=o.get('cost'),
                finalCost=o.get('finalCost'),
                meta=o.get('meta'),
                details=o.get('details'),
                userId=o.get('userId'),
            ))
        s.commit()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=4001, reload=False)
