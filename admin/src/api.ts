function getBase(): string {
  const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('tow_api_base') : null
  const env = (import.meta as any).env?.VITE_API_BASE as string | undefined
  return (ls && ls.trim()) || env || 'http://localhost:4001'
}

export async function api(url: string, options: RequestInit = {}) {
  const base = getBase()
  const full = /^https?:\/\//i.test(url) ? url : base.replace(/\/$/, '') + '/' + url.replace(/^\//, '')
  const res = await fetch(full, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error(await res.text())
  return res.status === 204 ? null : res.json()
}
