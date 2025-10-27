import { getApiBase } from './apiBase'

function withTimeout(makeRequest, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => { try { ctrl.abort() } catch {} }, ms)
  const p = makeRequest(ctrl)
  return p.finally(() => clearTimeout(t))
}

export async function requestCode(phone, timeoutMs = 8000) {
  const base = getApiBase()
  const res = await withTimeout((ctrl) => fetch(base + '/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
    signal: ctrl.signal,
  }), timeoutMs).catch((e)=>{ throw e })
  const json = await res.json().catch(()=>({}))
  if (!res.ok) throw new Error(json?.error || json?.detail || 'request_code_failed')
  return json // { ok, devCode, userExists }
}

export async function verifyAuth({ phone, code, name }, timeoutMs = 8000) {
  const base = getApiBase()
  const payload = { phone, code }
  if (name) payload.name = name
  const res = await withTimeout((ctrl) => fetch(base + '/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  }), timeoutMs).catch((e)=>{ throw e })
  const json = await res.json().catch(()=>({}))
  if (!res.ok) throw new Error(json?.error || json?.detail || 'verify_failed')
  return json // { token, user }
}
