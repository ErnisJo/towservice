function getBase(): string {
  const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('tow_api_base') : null
  const env = (import.meta as any).env?.VITE_API_BASE as string | undefined
  
  // If stored or env var exists, use it
  if (ls && ls.trim()) return ls.trim()
  if (env) return env
  
  // Try to detect network hostname dynamically
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:4001`
  }
  
  // Default to network IP for towservice project
  return 'http://192.168.0.101:4001'
}

export async function api(url: string, options: RequestInit = {}) {
  const base = getBase()
  const full = /^https?:\/\//i.test(url) ? url : base.replace(/\/$/, '') + '/' + url.replace(/^\//, '')
  const res = await fetch(full, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error(await res.text())
  return res.status === 204 ? null : res.json()
}
