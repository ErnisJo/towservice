import express from 'express'
import cors from 'cors'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'

const app = express()
app.use(cors())
app.use(express.json())
// Always return fresh data to clients (avoid stale caches)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.set('Surrogate-Control', 'no-store')
  next()
})

const DB_PATH = join(process.cwd(), 'db.json')
const readDB = () => {
  if (!existsSync(DB_PATH)) return {
    tariff: { base: 600, perKm: 40, per3min: 10 },
    orders: [],
    users: [],
    drivers: [],
    authCodes: [],
    sessions: [],
    settings: {
      support: { phone: '+996 555 000-000', email: 'support@example.com' },
      info: { about: 'Сервис вызова эвакуатора.', version: '1.0', company: 'Tow Service' }
    }
  }
  const data = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
  // ensure new collections exist
  data.users = Array.isArray(data.users) ? data.users : []
  data.drivers = Array.isArray(data.drivers) ? data.drivers : []
  data.orders = Array.isArray(data.orders) ? data.orders : []
  data.authCodes = Array.isArray(data.authCodes) ? data.authCodes : []
  data.sessions = Array.isArray(data.sessions) ? data.sessions : []
  data.settings = data.settings || { support: {}, info: {} }
  data.tariff = data.tariff || { base: 600, perKm: 40, per3min: 10 }
  return data
}
const writeDB = (data) => writeFileSync(DB_PATH, JSON.stringify(data, null, 2))

app.get('/health', (_, res) => res.json({ ok: true }))

app.get('/tariff', (req, res) => {
  const db = readDB()
  res.json(db.tariff)
})

app.put('/tariff', (req, res) => {
  const db = readDB()
  db.tariff = { ...db.tariff, ...req.body }
  writeDB(db)
  res.json(db.tariff)
})

app.get('/orders', (req, res) => {
  const db = readDB()
  res.json(db.orders)
})

app.post('/orders', (req, res) => {
  const db = readDB()
  const order = { id: nanoid(), createdAt: Date.now(), ...req.body }
  db.orders.unshift(order)
  writeDB(db)
  res.status(201).json(order)
})

app.delete('/orders', (req, res) => {
  const db = readDB()
  db.orders = []
  writeDB(db)
  res.status(204).end()
})

// Get order by id
app.get('/orders/:id', (req, res) => {
  const db = readDB()
  const o = db.orders.find(o => o.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'not_found' })
  res.json(o)
})

// Update order by id (merge)
app.put('/orders/:id', (req, res) => {
  const db = readDB()
  const idx = db.orders.findIndex(o => o.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not_found' })
  db.orders[idx] = { ...db.orders[idx], ...req.body }
  writeDB(db)
  res.json(db.orders[idx])
})

// Settings (support + info)
app.get('/settings', (req, res) => {
  const db = readDB()
  res.json(db.settings || { support: {}, info: {} })
})

app.put('/settings', (req, res) => {
  const db = readDB()
  db.settings = { ...(db.settings || {}), ...(req.body || {}) }
  writeDB(db)
  res.json(db.settings)
})

app.get('/support', (req, res) => {
  const db = readDB()
  res.json((db.settings && db.settings.support) || { phone: '', email: '' })
})

app.put('/support', (req, res) => {
  const db = readDB()
  db.settings = db.settings || {}
  db.settings.support = { ...(db.settings.support || {}), ...(req.body || {}) }
  writeDB(db)
  res.json(db.settings.support)
})

app.get('/info', (req, res) => {
  const db = readDB()
  res.json((db.settings && db.settings.info) || { about: '', version: '', company: '' })
})

app.put('/info', (req, res) => {
  const db = readDB()
  db.settings = db.settings || {}
  db.settings.info = { ...(db.settings.info || {}), ...(req.body || {}) }
  writeDB(db)
  res.json(db.settings.info)
})

// Auth by phone: request code
app.post('/auth/request-code', (req, res) => {
  const { phone } = req.body || {}
  if (!phone || typeof phone !== 'string') return res.status(400).json({ error: 'invalid_phone' })
  const db = readDB()
  // generate 4-digit dev code
  const code = String(Math.floor(1000 + Math.random() * 9000))
  const rec = { id: nanoid(), phone, code, createdAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 }
  db.authCodes.unshift(rec)
  // keep only last 100 codes
  db.authCodes = db.authCodes.slice(0, 100)
  const userExists = !!db.users.find(u => u.phone === phone)
  writeDB(db)
  // For development convenience, return code in response, and whether user exists
  res.json({ ok: true, devCode: code, userExists })
})

// Verify code and issue session
app.post('/auth/verify', (req, res) => {
  const { phone, code, name } = req.body || {}
  if (!phone || !code) return res.status(400).json({ error: 'invalid_payload' })
  const db = readDB()
  const now = Date.now()
  const match = db.authCodes.find(c => c.phone === phone && c.code === String(code) && c.expiresAt > now)
  if (!match) return res.status(400).json({ error: 'code_invalid' })
  // find or create user by phone
  let user = db.users.find(u => u.phone === phone)
  if (!user) {
    user = { id: nanoid(), phone, name: typeof name === 'string' ? name : '', role: 'customer', createdAt: Date.now() }
    db.users.unshift(user)
  }
  // create session (30 days)
  const token = nanoid()
  const session = { token, userId: user.id, createdAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000 }
  db.sessions.unshift(session)
  // optional: cleanup old codes for this phone
  db.authCodes = db.authCodes.filter(c => !(c.phone === phone))
  // keep sessions limited
  db.sessions = db.sessions.slice(0, 500)
  writeDB(db)
  res.json({ token, user })
})

function getToken(req) {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)/i.exec(h)
  return m ? m[1] : null
}

app.get('/me', (req, res) => {
  const token = getToken(req)
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  const db = readDB()
  const sess = db.sessions.find(s => s.token === token && s.expiresAt > Date.now())
  if (!sess) return res.status(401).json({ error: 'unauthorized' })
  const user = db.users.find(u => u.id === sess.userId)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  res.json({ user })
})

app.post('/logout', (req, res) => {
  const token = getToken(req)
  const db = readDB()
  if (token) {
    db.sessions = db.sessions.filter(s => s.token !== token)
    writeDB(db)
  }
  res.status(204).end()
})

// Users CRUD
app.get('/users', (req, res) => {
  const db = readDB()
  res.json(db.users)
})

app.post('/users', (req, res) => {
  const db = readDB()
  const user = { id: nanoid(), createdAt: Date.now(), ...req.body }
  db.users.unshift(user)
  writeDB(db)
  res.status(201).json(user)
})

app.get('/users/:id', (req, res) => {
  const db = readDB()
  const u = db.users.find(u => u.id === req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  res.json(u)
})

app.put('/users/:id', (req, res) => {
  const db = readDB()
  const idx = db.users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not_found' })
  db.users[idx] = { ...db.users[idx], ...req.body }
  writeDB(db)
  res.json(db.users[idx])
})

app.delete('/users/:id', (req, res) => {
  const db = readDB()
  db.users = db.users.filter(u => u.id !== req.params.id)
  writeDB(db)
  res.status(204).end()
})

// Drivers CRUD
app.get('/drivers', (req, res) => {
  const db = readDB()
  res.json(db.drivers)
})

app.post('/drivers', (req, res) => {
  const db = readDB()
  const driver = { id: nanoid(), createdAt: Date.now(), ...req.body }
  db.drivers.unshift(driver)
  writeDB(db)
  res.status(201).json(driver)
})

app.get('/drivers/:id', (req, res) => {
  const db = readDB()
  const d = db.drivers.find(d => d.id === req.params.id)
  if (!d) return res.status(404).json({ error: 'not_found' })
  res.json(d)
})

app.put('/drivers/:id', (req, res) => {
  const db = readDB()
  const idx = db.drivers.findIndex(d => d.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not_found' })
  db.drivers[idx] = { ...db.drivers[idx], ...req.body }
  writeDB(db)
  res.json(db.drivers[idx])
})

app.delete('/drivers/:id', (req, res) => {
  const db = readDB()
  db.drivers = db.drivers.filter(d => d.id !== req.params.id)
  writeDB(db)
  res.status(204).end()
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Tow server started on http://localhost:${PORT}`)
})
