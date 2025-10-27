import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

function useLocalState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : initial
  })
  return [state, (v: T) => { setState(v); localStorage.setItem(key, JSON.stringify(v)) }] as const
}

export default function App() {
  const [tab, setTab] = useState<'orders' | 'tariffs' | 'settings' | 'users' | 'drivers'>('orders')
  const [tariff, setTariffLocal] = useLocalState('tow_tariff', { base: 600, perKm: 40, per3min: 10 })
  const [tariffDraft, setTariffDraft] = useState(tariff)
  const [orders, setOrdersLocal] = useLocalState<any[]>('tow_orders', [])
  const [support, setSupportLocal] = useLocalState('tow_support', { phone: '+996 555 000-000', email: 'support@example.com' })
  const [info, setInfoLocal] = useLocalState('tow_info', { about: 'Сервис вызова эвакуатора.', version: '1.0', company: 'Tow Service' })
  const [users, setUsersLocal] = useLocalState<any[]>('tow_users', [])
  const [drivers, setDriversLocal] = useLocalState<any[]>('tow_drivers', [])
  const [activeChatUser, setActiveChatUser] = useState<any | null>(null) // acts as selected user for details page
  const [chat, setChat] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [userOrders, setUserOrders] = useState<any[]>([])
  const [adminWs, setAdminWs] = useState<WebSocket | null>(null)
  const adminWsRef = useRef<WebSocket | null>(null)
  const chatBoxRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const reconnectTimerRef = useRef<any>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const activeChatUserRef = useRef<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingTariff, setSavingTariff] = useState(false)
  const [savingSupport, setSavingSupport] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [savedTariffAt, setSavedTariffAt] = useState<number>(0)
  const [savedSupportAt, setSavedSupportAt] = useState<number>(0)
  const [savedInfoAt, setSavedInfoAt] = useState<number>(0)
  const [supportDraft, setSupportDraft] = useState(support)
  const [infoDraft, setInfoDraft] = useState(info)
  const [showJson, setShowJson] = useState(false)

  // Load from backend on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const [t, o, s, i, u, d] = await Promise.all([
          api('/tariff'),
          api('/orders'),
          api('/support'),
          api('/info'),
          api('/users'),
          api('/drivers'),
        ])
        setTariffLocal(t)
        setOrdersLocal(o)
        setSupportLocal(s)
        setInfoLocal(i)
        setUsersLocal(u)
        setDriversLocal(d)
      } catch (e) {
        console.warn('Backend not available, using local data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Manual refresh helper
  const refreshData = async () => {
    try {
      setLoading(true)
      const [t, o, s, i, u, d] = await Promise.all([
        api('/tariff'),
        api('/orders'),
        api('/support'),
        api('/info'),
        api('/users'),
        api('/drivers'),
      ])
      setTariffLocal(t)
      setOrdersLocal(o)
      setSupportLocal(s)
      setInfoLocal(i)
      setUsersLocal(u)
      setDriversLocal(d)
    } catch {}
    finally { setLoading(false) }
  }

  // Light polling for orders when Orders tab is active
  useEffect(() => {
    if (tab !== 'orders') return
    let timer: any = null
    const tick = async () => {
      try { const list = await api('/orders'); setOrdersLocal(list) } catch {}
      timer = setTimeout(tick, 5000)
    }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])

  // Лёгкий пуллинг пользователей/водителей при активной вкладке
  useEffect(() => {
    if (tab !== 'users') return
    let timer: any = null
    const tick = async () => { try { setUsersLocal(await api('/users')) } catch {} timer = setTimeout(tick, 8000) }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])
  useEffect(() => {
    if (tab !== 'drivers') return
    let timer: any = null
    const tick = async () => { try { setDriversLocal(await api('/drivers')) } catch {} timer = setTimeout(tick, 8000) }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])

  // keep drafts in sync when data loaded/refreshed
  useEffect(() => { setSupportDraft(support) }, [support])
  useEffect(() => { setInfoDraft(info) }, [info])
  useEffect(() => { setTariffDraft(tariff) }, [tariff])
  useEffect(() => { if (savedTariffAt) { const t = setTimeout(()=>setSavedTariffAt(0), 2000); return () => clearTimeout(t) } }, [savedTariffAt])
  useEffect(() => { if (savedSupportAt) { const t = setTimeout(()=>setSavedSupportAt(0), 2000); return () => clearTimeout(t) } }, [savedSupportAt])
  useEffect(() => { if (savedInfoAt) { const t = setTimeout(()=>setSavedInfoAt(0), 2000); return () => clearTimeout(t) } }, [savedInfoAt])

  // Admin WS for chat
  useEffect(() => {
    const base = (typeof localStorage!=='undefined' && (localStorage.getItem('tow_api_base')||'')) || (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4001'
    const wsUrl = base.replace(/^http/, 'ws') + '/ws/admin'
    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl)
        adminWsRef.current = ws
        setAdminWs(ws)
        ws.onopen = () => { reconnectAttemptsRef.current = 0 }
        ws.onmessage = (ev) => {
          try {
            const m = JSON.parse(ev.data)
            if (m?.type === 'message') {
              const d = m.data
              const sel = activeChatUserRef.current
              setChat(prev => {
                if (!(sel && d.userId === sel.id)) return prev
                const next = prev.some(x => x.id === d.id) ? prev : [...prev, d]
                // Auto-scroll if pinned to bottom
                try {
                  if (atBottomRef.current && chatBoxRef.current) {
                    requestAnimationFrame(() => {
                      const el = chatBoxRef.current!
                      el.scrollTop = el.scrollHeight
                    })
                  }
                } catch {}
                return next
              })
            }
          } catch {}
        }
        ws.onerror = () => {}
        ws.onclose = () => {
          if (!shouldReconnectRef.current) return
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current++), 10000)
          try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current) } catch {}
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
      } catch {}
    }
    connect()
    return () => {
      shouldReconnectRef.current = false
      try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current) } catch {}
      try { adminWsRef.current && adminWsRef.current.close() } catch {}
      setAdminWs(null)
    }
  }, [])

  // Load chat when selecting user
  const openUser = async (u: any) => {
    setActiveChatUser(u)
  activeChatUserRef.current = u
    try {
      const [hist, orders] = await Promise.all([
        api(`/users/${u.id}/chat`).catch(()=>[]),
        api(`/users/${u.id}/orders`).catch(()=>[]),
      ])
      setChat(hist as any[])
      setUserOrders(orders as any[])
  // Scroll to bottom on initial load
  setTimeout(() => { try { if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight } catch {} }, 0)
    } catch {
      setChat([])
      setUserOrders([])
    }
  }

  const sendAdminMessage = async () => {
    if (!activeChatUser || !chatInput.trim()) return
    const payload = { userId: activeChatUser.id, text: chatInput.trim() }
    // Try WS first for realtime echo
    const ws = adminWsRef.current
    const ok = !!ws && ws.readyState === WebSocket.OPEN
    if (ok) {
      try { ws!.send(JSON.stringify(payload)); setChatInput('') } catch {}
    } else {
      try { await api(`/users/${activeChatUser.id}/chat`, { method:'POST', body: JSON.stringify({ text: chatInput.trim(), sender: 'admin' }) }); setChatInput('') } catch {}
    }
  }

  // Helpers: only use stored metrics; no estimation
    // Helpers: only show stored metrics; do not calculate totals here
    const getDistanceKmValue = (o: any): number | null => {
      if (typeof o?.distance === 'number' && isFinite(o.distance)) return Math.max(0, o.distance / 1000)
      if (typeof o?.meta?.distanceKm === 'number' && isFinite(o.meta.distanceKm)) return Math.max(0, o.meta.distanceKm)
      return null
    }
    const getDurationMins = (o: any): number | null => {
      if (typeof o?.duration === 'number' && isFinite(o.duration)) return Math.max(0, Math.round(o.duration / 60))
      return null
    }

  const tariffJson = useMemo(() => JSON.stringify(tariff, null, 2), [tariff])
  const ordersJson = useMemo(() => JSON.stringify(orders, null, 2), [orders])

  const saveTariff = async (next: any) => {
    setTariffLocal(next)
    try { await api('/tariff', { method: 'PUT', body: JSON.stringify(next) }) } catch {}
  }
  const commitTariff = async () => {
    setSavingTariff(true)
    await saveTariff(tariffDraft)
    setSavingTariff(false)
    setSavedTariffAt(Date.now())
  }
  const cancelTariff = () => setTariffDraft(tariff)

  const clearOrders = async () => {
    setOrdersLocal([])
  try { await api('/orders', { method: 'DELETE' }) } catch {}
  }

  const [editing, setEditing] = useState<any | null>(null)
  const startEdit = async (id: string) => {
    try {
  const o = await api(`/orders/${id}`)
      setEditing(o)
    } catch {}
  }
  const saveOrder = async () => {
    if (!editing?.id) return
    try {
  const updated = await api(`/orders/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing) })
      setEditing(null)
      // refresh local list
      try {
  const list = await api('/orders')
        setOrdersLocal(list)
      } catch {}
    } catch {}
  }
  const cancelEdit = () => setEditing(null)

  const saveSupport = async (next: any) => {
    setSupportLocal(next)
  try { await api('/support', { method: 'PUT', body: JSON.stringify(next) }) } catch {}
  }

  const saveInfo = async (next: any) => {
    setInfoLocal(next)
  try { await api('/info', { method: 'PUT', body: JSON.stringify(next) }) } catch {}
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 16 }}>
      <h2>Админ-панель</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems:'center' }}>
        <button onClick={() => setTab('orders')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab==='orders'? '#eef':'#fff' }}>Заказы</button>
  <button onClick={() => setTab('tariffs')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab==='tariffs'? '#eef':'#fff' }}>Тарифы</button>
  <button onClick={() => setTab('users')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab==='users'? '#eef':'#fff' }}>Пользователи</button>
  <button onClick={() => setTab('drivers')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab==='drivers'? '#eef':'#fff' }}>Водители</button>
  <button onClick={() => setTab('settings')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab==='settings'? '#eef':'#fff' }}>Настройки</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>API:</span>
        <input
          placeholder="http://localhost:4000"
          defaultValue={(typeof localStorage!=='undefined' && localStorage.getItem('tow_api_base')) || ''}
          onBlur={(e)=>{ try { localStorage.setItem('tow_api_base', e.target.value || ''); location.reload(); } catch {} }}
          style={{ padding:'6px 8px', border:'1px solid #ddd', borderRadius:8, minWidth:260 }}
        />
  {tab === 'tariffs' && (
    <button onClick={() => setShowJson(v => !v)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: showJson ? '#fee' : '#fff' }}>
      {showJson ? 'Скрыть JSON тарифа' : 'Показать JSON тарифа'}
    </button>
  )}
  <button onClick={refreshData} disabled={loading} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: loading ? '#eee' : '#fff' }}>{loading ? 'Обновление…' : 'Обновить'}</button>
      </div>

      {tab === 'tariffs' && (
        <div style={{ maxWidth: 420 }}>
          <label>База, сом</label>
          <input
            type="number"
            value={tariffDraft.base}
            onChange={(e) => setTariffDraft({ ...tariffDraft, base: Number(e.target.value) })}
            style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }}
          />
          <label>За км, сом</label>
          <input
            type="number"
            value={tariffDraft.perKm}
            onChange={(e) => setTariffDraft({ ...tariffDraft, perKm: Number(e.target.value) })}
            style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }}
          />
          <label>За каждые 3 минуты, сом</label>
          <input
            type="number"
            value={tariffDraft.per3min}
            onChange={(e) => setTariffDraft({ ...tariffDraft, per3min: Number(e.target.value) })}
            style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }}
          />
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button disabled={savingTariff} onClick={commitTariff} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #0a84ff', background: savingTariff ? '#5aa9ff' : '#0a84ff', color:'#fff' }}>{savingTariff ? 'Сохранение…' : 'Сохранить'}</button>
            <button disabled={savingTariff} onClick={cancelTariff} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>Отменить</button>
            {!!savedTariffAt && <span style={{ color:'#0a8f3a', fontSize:12 }}>Сохранено</span>}
          </div>
          <p style={{ color: '#666', marginTop: 8 }}>Нажмите “Сохранить”, чтобы отправить изменения на сервер.</p>
        </div>
      )}

      {tab === 'orders' && (
        <div>
          {orders.length === 0 ? (
            <p>Заказов пока нет.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Адрес</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Дистанция</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Время</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Сумма</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={idx}>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: 8 }}>{o.address || '-'}</td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: 8 }}>{(() => { const d = getDistanceKmValue(o); return d == null ? '—' : `${d.toFixed(1)} км`; })()}</td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: 8 }}>{(() => { const m = getDurationMins(o); return m == null ? '—' : `${m} мин`; })()}</td>
                    
                      <td style={{ borderBottom: '1px solid #f3f3f3', padding: 8 }}>{(typeof o.cost === 'number' && isFinite(o.cost)) ? o.cost : (typeof o.finalCost === 'number' && isFinite(o.finalCost) ? o.finalCost : '—')} сом</td>
                    <td style={{ borderBottom: '1px solid #f3f3f3', padding: 8 }}>
                      <button onClick={() => startEdit(o.id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd' }}>Редактировать</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={clearOrders} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>Очистить</button>
            <button onClick={() => navigator.clipboard.writeText(ordersJson)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd' }}>Копировать JSON</button>
          </div>

          {editing && (
            <div style={{ marginTop: 20, padding: 16, border: '1px solid #eee', borderRadius: 10, background: '#fafafa', maxWidth: 720 }}>
              <h3>Редактирование заявки</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label>Адрес A</label>
                  <input value={editing.fromAddress||''} onChange={e=>setEditing({ ...editing, fromAddress:e.target.value })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Адрес B</label>
                  <input value={editing.toAddress||''} onChange={e=>setEditing({ ...editing, toAddress:e.target.value })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Имя водителя</label>
                  <input value={editing.details?.driverName||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), driverName:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Авто (марка)</label>
                  <input value={editing.details?.vehicleMake||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), vehicleMake:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Авто (модель)</label>
                  <input value={editing.details?.vehicleModel||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), vehicleModel:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Гос. номер</label>
                  <input value={editing.details?.plateNumber||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), plateNumber:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Цвет</label>
                  <input value={editing.details?.vehicleColor||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), vehicleColor:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
                <div>
                  <label>Заметки</label>
                  <input value={editing.details?.notes||''} onChange={e=>setEditing({ ...editing, details:{ ...(editing.details||{}), notes:e.target.value } })} style={{ display:'block', width:'100%', padding:8, border:'1px solid #ddd', borderRadius:8, margin:'6px 0 12px' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button onClick={saveOrder} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #0a84ff', background:'#0a84ff', color:'#fff' }}>Сохранить</button>
                <button onClick={cancelEdit} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>Отмена</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ maxWidth: 420 }}>
            <h3>Служба поддержки</h3>
            <label>Телефон</label>
            <input value={supportDraft.phone} onChange={e => setSupportDraft({ ...supportDraft, phone: e.target.value })} style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }} />
            <label>Email</label>
            <input type="email" value={supportDraft.email} onChange={e => setSupportDraft({ ...supportDraft, email: e.target.value })} style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }} />
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button disabled={savingSupport} onClick={async () => { setSavingSupport(true); await saveSupport(supportDraft); setSavingSupport(false); setSavedSupportAt(Date.now()); }} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #0a84ff', background: savingSupport ? '#5aa9ff' : '#0a84ff', color:'#fff' }}>{savingSupport ? 'Сохранение…' : 'Сохранить'}</button>
              <button disabled={savingSupport} onClick={() => setSupportDraft(support)} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>Отменить</button>
              {!!savedSupportAt && <span style={{ color:'#0a8f3a', fontSize:12 }}>Сохранено</span>}
            </div>
            <p style={{ color: '#666', marginTop: 8 }}>Нажмите “Сохранить”, чтобы отправить изменения на сервер.</p>
          </div>
          <div style={{ maxWidth: 520 }}>
            <h3>Информация</h3>
            <label>О сервисе</label>
            <textarea value={infoDraft.about} onChange={e => setInfoDraft({ ...infoDraft, about: e.target.value })} rows={4} style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }} />
            <label>Версия</label>
            <input value={infoDraft.version} onChange={e => setInfoDraft({ ...infoDraft, version: e.target.value })} style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }} />
            <label>Компания</label>
            <input value={infoDraft.company} onChange={e => setInfoDraft({ ...infoDraft, company: e.target.value })} style={{ display: 'block', width: '100%', padding: 8, margin: '6px 0 12px', border: '1px solid #ddd', borderRadius: 8 }} />
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button disabled={savingInfo} onClick={async () => { setSavingInfo(true); await saveInfo(infoDraft); setSavingInfo(false); setSavedInfoAt(Date.now()); }} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #0a84ff', background: savingInfo ? '#5aa9ff' : '#0a84ff', color:'#fff' }}>{savingInfo ? 'Сохранение…' : 'Сохранить'}</button>
              <button disabled={savingInfo} onClick={() => setInfoDraft(info)} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd' }}>Отменить</button>
              {!!savedInfoAt && <span style={{ color:'#0a8f3a', fontSize:12 }}>Сохранено</span>}
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && !activeChatUser && (
        <div>
          <h3>Пользователи</h3>
          <UsersTable rows={users} onOpenUser={openUser} />
        </div>
      )}
      {tab === 'users' && !!activeChatUser && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <button onClick={() => { setActiveChatUser(null); setChat([]); setUserOrders([]) }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>← Назад</button>
            <h3 style={{ margin:0 }}>Пользователь: {activeChatUser.name || activeChatUser.phone}</h3>
            <div style={{ marginLeft:'auto', fontSize:12, color:'#666' }}>ID: {activeChatUser.id}</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16, alignItems:'start' }}>
            <div style={{ border:'1px solid #eee', borderRadius:10, padding:12, display:'flex', flexDirection:'column', height: 560 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, padding:'8px 10px', border:'1px solid #f0f0f0', borderRadius:8, background:'#fcfcfd', marginBottom:10 }}>
                <div><div style={{ fontSize:12, color:'#777' }}>Телефон</div><div>{activeChatUser.phone || '—'}</div></div>
                <div><div style={{ fontSize:12, color:'#777' }}>Имя</div><div>{activeChatUser.name || '—'}</div></div>
                <div><div style={{ fontSize:12, color:'#777' }}>Роль</div><div>{activeChatUser.role || 'customer'}</div></div>
                <div><div style={{ fontSize:12, color:'#777' }}>Создан</div><div>{activeChatUser.createdAt ? new Date(activeChatUser.createdAt).toLocaleString() : '—'}</div></div>
              </div>
              <div style={{ fontWeight:600, marginBottom:6 }}>Чат</div>
              <div
                ref={chatBoxRef}
                onScroll={(e) => {
                  try {
                    const el = e.currentTarget as HTMLDivElement
                    const threshold = 60
                    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
                  } catch { atBottomRef.current = true }
                }}
                style={{ flex:1, overflowY:'auto', background:'#fafafa', padding:8, borderRadius:8 }}
              >
                {chat.length === 0 ? (
                  <p style={{ color:'#777' }}>Сообщений пока нет.</p>
                ) : (
                  chat.map((m:any) => (
                    <div key={m.id} style={{ display:'flex', margin:'6px 0', justifyContent: m.sender==='admin' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'70%', padding:'8px 10px', borderRadius:10, background: m.sender==='admin' ? '#0a84ff' : '#e5e5ea', color: m.sender==='admin' ? '#fff' : '#000' }}>
                        <div style={{ fontSize:12, opacity:0.8, marginBottom:4 }}>{m.sender==='admin'?'Админ':'Пользователь'}</div>
                        <div>{m.text}</div>
                        <div style={{ fontSize:11, opacity:0.6, marginTop:4 }}>{new Date(m.createdAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Введите сообщение" style={{ flex:1, padding:8, border:'1px solid #ddd', borderRadius:8 }} />
                <button onClick={sendAdminMessage} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #0a84ff', background:'#0a84ff', color:'#fff' }}>Отправить</button>
              </div>
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ fontWeight:600 }}>Заказы пользователя</div>
                <button onClick={async()=>{ try { const list = await api(`/users/${activeChatUser.id}/orders`); setUserOrders(list) } catch {} }} style={{ marginLeft:'auto', padding:'6px 10px', borderRadius:8, border:'1px solid #ddd' }}>Обновить</button>
              </div>
              {userOrders.length === 0 ? (
                <p>Нет заказов.</p>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Дата</th>
                      <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Откуда → Куда</th>
                      <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userOrders.map((o:any) => (
                      <tr key={o.id}>
                        <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
                        <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{o.fromAddress || o.address || '—'}{o.toAddress ? ` → ${o.toAddress}` : ''}</td>
                        <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{(typeof o.finalCost==='number' && isFinite(o.finalCost)) ? o.finalCost : (typeof o.cost==='number' && isFinite(o.cost) ? o.cost : '—')} сом</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'drivers' && (
        <div>
          <h3>Водители</h3>
          <DriversTable rows={drivers} />
        </div>
      )}

      {tab === 'tariffs' && showJson && (
        <pre style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #eee', marginTop: 16, whiteSpace: 'pre-wrap' }}>{tariffJson}</pre>
      )}
    </div>
  )
}

function UsersTable({ rows, onOpenUser }: { rows: any[], onOpenUser?: (u:any)=>void }) {
  if (!rows?.length) return <p>Нет пользователей.</p>
  const fmt = (ts?: number) => ts ? new Date(ts).toLocaleString() : '—'
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead><tr>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Телефон</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Имя</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Роль</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Создан</th>
    {onOpenUser && <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Действия</th>}
      </tr></thead>
      <tbody>
        {rows.map((r:any) => (
          <tr key={r.id}>
      <td style={{ borderBottom:'1px solid #f3f3f3', padding:8, cursor:onOpenUser?'pointer':undefined }} onClick={()=>onOpenUser && onOpenUser(r)}>{r.phone || '—'}</td>
      <td style={{ borderBottom:'1px solid #f3f3f3', padding:8, cursor:onOpenUser?'pointer':undefined }} onClick={()=>onOpenUser && onOpenUser(r)}>{r.name || '—'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{r.role || 'customer'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{fmt(r.createdAt)}</td>
      {onOpenUser && (
              <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>
        <button onClick={() => onOpenUser(r)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #ddd' }}>Открыть</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DriversTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p>Нет водителей.</p>
  const fmt = (ts?: number) => ts ? new Date(ts).toLocaleString() : '—'
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead><tr>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Телефон</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Имя</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Авто</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Гос. номер</th>
        <th style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>Создан</th>
      </tr></thead>
      <tbody>
        {rows.map((r:any) => (
          <tr key={r.id}>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{r.phone || '—'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{r.name || '—'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{r.car || '—'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{r.plate || '—'}</td>
            <td style={{ borderBottom:'1px solid #f3f3f3', padding:8 }}>{fmt(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
