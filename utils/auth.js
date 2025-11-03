import { getApiBase, togglePort } from './apiBase'

const KG_COUNTRY_CODE = '996'

const digitsOnly = (value) => (value ? String(value).replace(/\D+/g, '') : '')

export function normalizeKgPhone(input) {
  const raw = input == null ? '' : String(input).trim()
  if (!raw) return { e164: '', display: '', digits: '' }

  let digits = digitsOnly(raw)
  if (!digits) return { e164: '', display: '', digits: '' }

  // Preserve explicit non-Kyrgyz numbers with leading +/00
  if ((raw.startsWith('+') || raw.startsWith('00')) && !digits.startsWith(KG_COUNTRY_CODE)) {
    const international = `+${digits}`
    return { e164: international, display: international, digits }
  }

  if (raw.startsWith('00')) {
    digits = digits.slice(2)
  }

  digits = digits.replace(/^0+/, '')
  if (!digits) return { e164: '', display: '', digits: '' }

  if (!digits.startsWith(KG_COUNTRY_CODE)) {
    if (digits.length > 9) {
      digits = digits.slice(-9)
    }
    digits = KG_COUNTRY_CODE + digits
  }

  const e164 = `+${digits}`
  const display = `+${digits.slice(0, 3)} ${digits.slice(3)}`
  return { e164, display, digits }
}

function withTimeout(makeRequest, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => { try { ctrl.abort() } catch {} }, ms)
  const p = makeRequest(ctrl)
  return p.finally(() => clearTimeout(t))
}

export async function requestCode(phone, timeoutMs = 30000) {
  const normalizedPhone = normalizeKgPhone(phone)
  if (!normalizedPhone.e164) {
    throw new Error('invalid_phone_number')
  }

  const base = getApiBase()
  console.log('[AUTH] API Base:', base)
  console.log('[AUTH] Requesting code for:', phone, '→', normalizedPhone.e164)
  // Try primary API, then fallback to toggled port (4000/4001)
  let res
  try {
    const url = base + '/api/v1/auth/send-code'
    console.log('[AUTH] Fetching:', url)
    res = await withTimeout((ctrl) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone.e164 }),
      signal: ctrl.signal,
    }), timeoutMs)
  } catch (e) {
    const alt = togglePort(base)
    if (alt && alt !== base) {
      try {
        res = await withTimeout((ctrl) => fetch(alt + '/api/v1/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: normalizedPhone.e164 }),
          signal: ctrl.signal,
        }), timeoutMs)
      } catch (ee) {
        throw ee
      }
    } else {
      throw e
    }
  }
  const json = await res.json().catch(()=>({}))
  if (!res.ok) throw new Error(json?.error || json?.detail || 'request_code_failed')

  return {
    ...json,
    phone: json?.phone || normalizedPhone.e164,
    phoneDisplay: json?.phoneDisplay || json?.phone_display || normalizedPhone.display,
  }
}

export async function verifyAuth({ phone, code, name }, timeoutMs = 30000) {
  const normalizedPhone = normalizeKgPhone(phone)
  if (!normalizedPhone.e164) {
    throw new Error('invalid_phone_number')
  }
  const base = getApiBase()
  console.log('[AUTH] Verify - API Base:', base)
  console.log('[AUTH] Verify - Phone:', phone, '→', normalizedPhone.e164, 'Code:', code)
  const payload = { phone: normalizedPhone.e164, code }
  if (name) {
    payload.name = name
    payload.display_name = name
  }
  let res
  try {
    const url = base + '/api/v1/auth/verify-code'
    console.log('[AUTH] Verify - Fetching:', url)
    res = await withTimeout((ctrl) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }), timeoutMs)
  } catch (e) {
    console.error('[AUTH] Verify - Primary fetch failed:', e)
    const alt = togglePort(base)
    if (alt && alt !== base) {
      try {
        console.log('[AUTH] Verify - Trying alternate:', alt)
        res = await withTimeout((ctrl) => fetch(alt + '/api/v1/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        }), timeoutMs)
      } catch (ee) {
        console.error('[AUTH] Verify - Alternate fetch failed:', ee)
        throw ee
      }
    } else {
      throw e
    }
  }
  console.log('[AUTH] Verify - Response status:', res.status)
  const json = await res.json().catch(()=>({}))
  console.log('[AUTH] Verify - Response JSON:', json)
  if (!res.ok) throw new Error(json?.error || json?.detail || 'verify_failed')

  // Normalize token/user fields to existing app expectations
  const normalized = { ...json }
  normalized.phone = normalized.phone || normalizedPhone.e164
  normalized.phoneDisplay = normalized.phoneDisplay || normalized.phone_display || normalizedPhone.display
  if (!normalized.token && json?.access_token) {
    normalized.token = json.access_token
  }
  if (!normalized.user && (json?.user || json?.user_id != null)) {
    normalized.user = json.user || { id: json.user_id, phone: normalized.phoneDisplay }
  }
  if (normalized.user && !normalized.user.phone) {
    normalized.user.phone = normalized.phoneDisplay
  }
  if (normalized.user) {
    normalized.user = {
      ...normalized.user,
      phoneDisplay: normalized.phoneDisplay,
    }
  }
  if (normalized.user) {
    const preferred = (normalized.user.display_name || normalized.user.name || normalized.user.first_name || normalized.user.last_name || normalized.user.phone || '').trim()
    if (preferred) {
      normalized.user = { ...normalized.user, name: preferred }
    } else if (!normalized.user.name) {
      normalized.user = { ...normalized.user, name: '' }
    }
  }

  return normalized // { token, user }
}
