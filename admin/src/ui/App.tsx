import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  accepted: 'Принят исполнителем',
  in_progress: 'В пути',
  completed: 'Завершён',
  cancelled: 'Отменён',
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const coalesce = <T,>(...values: Array<T | null | undefined | ''>): T | null => {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value as T
    }
  }
  return null
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const date = new Date(value as any)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateTime = (value: unknown): string => {
  const date = toDate(value)
  return date ? date.toLocaleString() : '—'
}

const getDistanceKmValue = (order: any): number | null => {
  if (!order) return null
  if (isFiniteNumber(order.distance)) return Math.max(0, order.distance / 1000)
  if (isFiniteNumber(order.meta?.distanceKm)) return Math.max(0, order.meta.distanceKm)
  if (isFiniteNumber(order.meta?.distanceKM)) return Math.max(0, order.meta.distanceKM)
  if (isFiniteNumber(order.meta?.distance)) return Math.max(0, order.meta.distance / 1000)
  return null
}

const getDurationMins = (order: any): number | null => {
  if (!order) return null
  if (isFiniteNumber(order.duration)) return Math.max(0, Math.round(order.duration / 60))
  if (isFiniteNumber(order.meta?.durationMinutes)) return Math.max(0, Math.round(order.meta.durationMinutes))
  if (isFiniteNumber(order.meta?.durationMins)) return Math.max(0, Math.round(order.meta.durationMins))
  if (isFiniteNumber(order.meta?.durationSec)) return Math.max(0, Math.round(order.meta.durationSec / 60))
  return null
}

const getCostValue = (order: any): number | null => {
  if (!order) return null
  if (isFiniteNumber(order.finalCost)) return order.finalCost
  if (isFiniteNumber(order.cost)) return order.cost
  if (isFiniteNumber(order.meta?.finalCost)) return order.meta.finalCost
  if (isFiniteNumber(order.meta?.total)) return order.meta.total
  return null
}

const formatSom = (value: number | null): string => {
  if (!isFiniteNumber(value)) return '—'
  try {
    return `${new Intl.NumberFormat('ru-RU').format(value!)} сом`
  } catch {
    return `${value} сом`
  }
}

const formatDistanceKm = (value: number | null): string => {
  if (!isFiniteNumber(value)) return '—'
  return `${value.toFixed(1)} км`
}

const formatDurationMins = (value: number | null): string => {
  if (!isFiniteNumber(value)) return '—'
  return `${value} мин`
}

const formatCoords = (coords: any): string => {
  if (!coords) return '—'
  if (Array.isArray(coords)) return coords.join(', ')
  if (typeof coords === 'object') {
    const rawLat = coords.lat ?? coords.latitude ?? coords.latDeg ?? coords.latitute
    const rawLon = coords.lon ?? coords.lng ?? coords.longitude ?? coords.longDeg
    const lat = typeof rawLat === 'number' ? rawLat : (typeof rawLat === 'string' ? parseFloat(rawLat) : null)
    const lon = typeof rawLon === 'number' ? rawLon : (typeof rawLon === 'string' ? parseFloat(rawLon) : null)
    if (isFiniteNumber(lat) && isFiniteNumber(lon)) return `${lat}, ${lon}`
    try { return JSON.stringify(coords) } catch { return String(coords) }
  }
  return String(coords)
}
const GLOBAL_STYLES = `
:root {
  color-scheme: dark;
  --neo-radius: 5px;
  --neo-border: rgba(120,140,200,0.24);
  --neo-border-soft: rgba(120,140,200,0.12);
  --neo-shadow-outer: 0 14px 32px rgba(6,10,24,0.42);
  --neo-shadow-soft: 0 8px 20px rgba(8,12,28,0.32);
  --neo-shadow-inset: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 10px rgba(4,8,20,0.55);
  --neo-shell-bg: radial-gradient(circle at top left, #171f33 0%, #0a1325 48%, #040711 100%);
}
body { margin: 0; background: #050712; transition: background 0.3s ease, color 0.3s ease; }
body[data-theme="light"] { background: #eef2ff; color: #1c2433; }
body[data-theme="dark"] { background: #050712; }
.neo-shell {
  position: relative;
  min-height: 100vh;
  padding: clamp(24px, 4vw, 64px);
  background: var(--neo-shell-bg);
  color: #dce5ff;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  overflow: hidden;
}
.neo-shell::before {
  content: '';
  position: absolute;
  inset: -40%;
  background: radial-gradient(closest-side at 22% 18%, rgba(96,140,255,0.18), transparent), radial-gradient(closest-side at 78% 12%, rgba(118,224,255,0.14), transparent);
  filter: blur(12px);
}
.neo-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(1px 1px at 32px 28px, rgba(255,255,255,0.14) 0%, transparent 52%), radial-gradient(1px 1px at 96px 92px, rgba(255,255,255,0.12) 0%, transparent 58%);
  background-size: 140px 140px;
  opacity: 0.28;
  pointer-events: none;
  animation: drift 80s linear infinite;
}
@keyframes drift {
  from { transform: translate3d(0,0,0); }
  to { transform: translate3d(-120px,-80px,0); }
}
.neo-frame {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 2vw, 28px);
}
.neo-header {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(14px, 2vw, 20px);
  align-items: flex-start;
  justify-content: space-between;
}
.neo-title-block { display: flex; flex-direction: column; gap: 6px; }
.neo-title {
  font-size: clamp(24px, 5vw, 34px);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f4f7ff;
}
.neo-subtitle {
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(198,210,245,0.72);
}
.neo-tabs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(120px, 1fr);
  gap: 8px;
  padding: 10px;
  border-radius: var(--neo-radius);
  background: rgba(18,26,46,0.55);
  backdrop-filter: blur(18px);
  border: 1px solid var(--neo-border-soft);
}
.neo-tab {
  border: 1px solid transparent;
  border-radius: var(--neo-radius);
  padding: 10px 14px;
  font-size: 13px;
  letter-spacing: 0.05em;
  text-transform: none;
  font-weight: 500;
  color: rgba(200,212,248,0.8);
  background: transparent;
  box-shadow: 9px 10px 20px rgba(8,12,28,0.4);
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.neo-tab:hover { background: rgba(18,26,44,0.82); color: #f7f9ff; transform: translateY(-1px); }
.neo-tab.is-active {
  color: #ffffff;
  background: linear-gradient(135deg, rgb(12 45 153), rgb(23 41 95));
}
.neo-api {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-radius: var(--neo-radius);
}
.neo-api label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(168,184,224,0.66); }
.neo-input {
  background: rgba(9,14,26,0.92);
  border: 1px solid rgba(96,128,220,0.22);
  border-radius: var(--neo-radius);
  padding: 9px 14px;
  color: #eef3ff;
  font-size: 13px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.neo-input:focus { border-color: rgba(128,168,255,0.62); box-shadow: 0 0 0 2px rgba(79,126,255,0.2); outline: none; }
.neo-main { display: flex; flex-direction: column; gap: 20px; }
.neo-stack { display: grid; gap: 20px; }
.neo-grid { display: grid; gap: clamp(18px, 3vw, 28px); grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.neo-card {
  position: relative;
  padding: clamp(18px, 3vw, 26px);
  border-radius: var(--neo-radius);
  background: rgba(15,22,38,0.86);
  border: 1px solid var(--neo-border-soft);
  box-shadow: var(--neo-shadow-soft);
}
.neo-card h3 { margin: 0 0 14px; font-size: 17px; font-weight: 600; letter-spacing: 0.05em; color: #e6ecff; }
.neo-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(174,190,236,0.7); margin-bottom: 6px; display: block; }
.neo-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.neo-row.between { justify-content: space-between; }
.neo-row.end { justify-content: flex-end; }
.neo-button {
  border: 1px solid rgba(104,134,220,0.32);
  border-radius: var(--neo-radius);
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: none;
  font-weight: 600;
  cursor: pointer;
  color: #eaf0ff;
  background: linear-gradient(135deg, rgba(36,58,112,0.85), rgba(20,32,70,0.92));
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.neo-button:hover { transform: translateY(-1px); box-shadow: var(--neo-shadow-soft); border-color: rgba(128,168,255,0.6); }
.neo-button:active { transform: translateY(0); box-shadow: none; }
.neo-button.is-danger { background: linear-gradient(135deg, rgba(176,56,76,0.85), rgba(102,28,36,0.92)); border-color: rgba(210,92,112,0.4); }
.neo-button.is-ghost { background: rgba(14,20,36,0.82); color: rgba(208,218,246,0.85); border-color: rgba(110,138,210,0.26); }
.neo-button.is-active { box-shadow: var(--neo-shadow-soft); border-color: rgba(126,168,255,0.65); }
.neo-button.tiny { padding: 6px 10px; font-size: 11px; }
.neo-chip-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 8px; }
.neo-chip {
  width: max-content;
  padding: 0px;
  border-radius: var(--neo-radius);
  color: #f2f6ff;
  display: flex;
  flex-direction: column;
}
.neo-chip span { font-size: 12px; letter-spacing: 0.04em; color: rgba(180,194,232,0.7); text-transform: uppercase; }
.neo-chip strong { font-size: 18px; letter-spacing: 0.03em; }
.neo-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #dfe6ff; border: 1px solid rgba(35,46,70,0.7); border-radius: var(--neo-radius); overflow: hidden; }
.neo-table thead th { text-align: left; padding: 12px 14px; background: rgba(20,28,48,0.85); border-bottom: 1px solid rgba(40,56,92,0.8); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(198,210,246,0.8); }
.neo-table tbody td { padding: 11px 14px; border-bottom: 1px solid rgba(28,38,62,0.9); background: rgba(10,16,28,0.55); }
.neo-table tbody tr:hover td { background: rgba(30,40,70,0.65); }
.neo-table tbody tr.is-selected td {
  background: rgba(42,58,96,0.78);
  border-bottom-color: rgba(52,72,120,0.9);
}
.neo-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(24,34,56,0.78); border: 1px solid rgba(124,152,216,0.32); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(190,206,244,0.78); }
.neo-json { padding: 16px; border-radius: var(--neo-radius); background: rgba(15,22,34,0.9); border: 1px solid rgba(110,140,210,0.18); color: #9aaefb; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; line-height: 1.4; }
.neo-json.is-inline { margin-top: 16px; max-height: 320px; overflow: auto; }
.neo-empty { color: rgba(164,182,224,0.74); font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; }
.neo-chat { display: flex; flex-direction: column; gap: 14px; height: 100%; }
.neo-chat-box { flex: 1; overflow-y: auto; padding: 16px; border-radius: var(--neo-radius); background: rgba(14,20,36,0.88); border: 1px solid var(--neo-border-soft); }
.neo-chat-empty { color: rgba(160,178,220,0.7); font-size: 13px; text-align: center; margin-top: 48px; letter-spacing: 0.06em; text-transform: uppercase; }
.neo-bubble { max-width: 70%; padding: 10px 14px; border-radius: calc(var(--neo-radius) + 4px); background: linear-gradient(135deg, rgba(70,108,236,0.78), rgba(34,52,120,0.9)); box-shadow: var(--neo-shadow-soft); color: #f5f7ff; display: flex; flex-direction: column; gap: 4px; }
.neo-bubble.user { background: linear-gradient(135deg, rgba(28,40,78,0.88), rgba(18,26,46,0.9)); }
.neo-bubble small { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(200,210,246,0.6); }
.neo-bubble-row { display: flex; margin: 6px 0; }
.neo-bubble-row.admin { justify-content: flex-end; }
.neo-bubble-row.user { justify-content: flex-start; }
.neo-chat-controls { display: flex; gap: 10px; }
.neo-textarea {
  border: 1px solid rgba(96,128,210,0.24);
  border-radius: var(--neo-radius);
  padding: 10px 14px;
  resize: none;
  background: rgba(12,18,30,0.9);
  color: #f2f5ff;
  font-size: 13px;
  min-height: 48px;
}
.neo-textarea:focus { border-color: rgba(126,164,255,0.6); outline: none; box-shadow: 0 0 0 2px rgba(88,132,255,0.22); }
.neo-textarea::placeholder { color: rgba(160,180,220,0.52); }
.neo-form-grid { display: grid; gap: 16px; }
.neo-form-grid.two { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.neo-form-item { display: flex; flex-direction: column; gap: 6px; }
.neo-bento {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  align-items: stretch;
  margin-bottom: 6px;
  width: 100%;
  max-width: 500px;
  box-sizing: border-box;
}
.neo-card.is-compact { padding: 6px; }
.neo-card.is-compact .neo-chip-grid { margin-bottom: 2px; gap: 6px; }
.neo-card.is-compact .neo-chip { padding: 0; font-size: 12px; }
.neo-card.is-compact .neo-chip span { font-size: 11px; }
.neo-card.is-compact .neo-chip strong { font-size: 15px; }
.neo-card.is-compact .neo-label { font-size: 11px; }
.neo-card.slate { background: rgba(16,24,42,0.84); }
.neo-card.glass {
  background: rgb(14 21 38);
}
.neo-edit-card { margin-top: 18px; }
.neo-status { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7fd5ff; }
@media (max-width: 860px) {
  .neo-tabs { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(140px,1fr)); }
  .neo-chat-layout { grid-template-columns: 1fr !important; }
}
.neo-chat-layout { display: grid; grid-template-columns: minmax(340px, 1.1fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.neo-orders-controls { display: flex; flex-wrap: wrap; gap: 10px; }
.neo-clickable { cursor: pointer; }
.neo-clickable:hover { color: #f3f5ff; }
.neo-back { border: none; background: none; color: rgba(188,206,244,0.72); cursor: pointer; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; }
.neo-back:hover { color: #f5f7ff; }
.neo-note { font-size: 12px; color: rgba(166,182,224,0.7); margin-top: 10px; letter-spacing: 0.04em; }
.neo-detail-card { margin-top: 10px; }
.neo-detail-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 12px; }
.neo-detail-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: var(--neo-radius);
  background: rgba(12,18,32,0.82);
  border: 1px solid rgba(90,110,170,0.22);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
.neo-detail-title { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(180,198,244,0.68); }
.neo-detail-value { font-size: 13px; color: #f3f6ff; line-height: 1.5; word-break: break-word; }
.neo-detail-em { font-weight: 600; letter-spacing: 0.03em; }
.neo-timeline { display: grid; gap: 6px; font-size: 12px; color: rgba(170,188,236,0.7); }
.neo-timeline > span { display: flex; flex-direction: column; gap: 2px; }
.neo-timeline strong { font-size: 12px; color: #f6f8ff; font-weight: 600; letter-spacing: 0.02em; }
.neo-detail-meta { display: grid; gap: 4px; font-size: 12px; color: rgba(184,202,246,0.76); word-break: break-word; }
.neo-detail-meta dt { font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.neo-detail-meta dd { margin: 0 0 6px; color: rgba(210,222,255,0.9); }
.neo-shell.theme-dark { color-scheme: dark; }
.neo-shell.theme-light {
  background: radial-gradient(circle at top left, #f8fbff 0%, #e4ecff 45%, #d7e2f8 100%);
  color: #1e2838;
  color-scheme: light;
}
.neo-shell.theme-light .neo-title { color: #122454; text-shadow: none; }
.neo-shell.theme-light .neo-subtitle { color: rgba(56,74,116,0.68); }
.neo-shell.theme-light .neo-tabs {
  background: rgba(255,255,255,0.75);
  border: 1px solid rgba(160,180,220,0.4);
}
.neo-shell.theme-light .neo-tab {
  color: rgba(42,56,92,0.78);
  box-shadow: 6px 8px 16px rgba(120,140,180,0.25);
}
.neo-shell.theme-light .neo-tab:hover {
  background: rgba(222,230,255,0.9);
  color: #0b1c4d;
}
.neo-shell.theme-light .neo-tab.is-active {
  color: #ffffff;
  background: linear-gradient(135deg, rgb(116 158 255), rgb(78 112 210));
}
.neo-shell.theme-light .neo-button {
  background: linear-gradient(135deg, rgba(56,108,232,0.92), rgba(28,58,168,0.95));
  color: #ffffff;
  border-color: rgba(96,128,200,0.42);
  box-shadow: 8px 12px 20px rgba(80,110,180,0.25);
}
.neo-shell.theme-light .neo-button.is-ghost {
  background: rgba(246,248,255,0.95);
  color: #23325a;
  border-color: rgba(120,150,210,0.35);
}
.neo-shell.theme-light .neo-button.is-danger {
  background: linear-gradient(135deg, rgba(244,112,112,0.92), rgba(204,60,60,0.95));
  border-color: rgba(220,96,96,0.45);
}
.neo-shell.theme-light .neo-card {
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(178,192,226,0.6);
  box-shadow: 16px 18px 32px rgba(140,156,190,0.28);
  color: #1a2434;
}
.neo-shell.theme-light .neo-card.glass { background: rgba(255,255,255,0.86); }
.neo-shell.theme-light .neo-card.slate { background: rgba(248,250,255,0.92); }
.neo-shell.theme-light .neo-label { color: rgba(70,90,130,0.7); }
.neo-shell.theme-light .neo-status { color: #1f4fd6; }
.neo-shell.theme-light .neo-pill {
  background: rgba(226,232,255,0.9);
  border-color: rgba(124,148,210,0.36);
  color: #20305a;
}
.neo-shell.theme-light .neo-chip {
  padding: 0;
  color: #273456;
}
.neo-shell.theme-light .neo-chip span { color: rgba(78,100,148,0.68); }
.neo-shell.theme-light .neo-chip strong { color: #1c2d5a; }
.neo-shell.theme-light .neo-table {
  border-color: rgba(184,198,228,0.7);
  color: #1d2736;
}
.neo-shell.theme-light .neo-table thead th {
  background: rgba(241,244,255,0.96);
  color: #23386e;
  border-bottom: 1px solid rgba(176,190,224,0.7);
}
.neo-shell.theme-light .neo-table tbody td {
  background: rgba(255,255,255,0.92);
  border-bottom: 1px solid rgba(220,228,250,0.9);
  color: #1c2735;
}
.neo-shell.theme-light .neo-table tbody tr:hover td { background: rgba(226,234,255,0.64); }
.neo-shell.theme-light .neo-table tbody tr.is-selected td {
  background: rgba(210,222,255,0.9);
  border-bottom-color: rgba(184,198,236,0.9);
}
.neo-shell.theme-light .neo-chat-box {
  background: rgba(248,250,255,0.95);
  border-color: rgba(168,188,218,0.5);
}
.neo-shell.theme-light .neo-bubble {
  background: linear-gradient(135deg, rgba(148,180,255,0.92), rgba(102,134,236,0.92));
  color: #172441;
}
.neo-shell.theme-light .neo-bubble small { color: rgba(60,80,130,0.62); }
.neo-shell.theme-light .neo-bubble.user {
  background: linear-gradient(135deg, rgba(230,238,255,0.96), rgba(190,206,245,0.92));
}
.neo-shell.theme-light .neo-textarea {
  background: rgba(250,252,255,0.95);
  border-color: rgba(148,176,226,0.45);
  color: #1f2d3f;
}
.neo-shell.theme-light .neo-input {
  background: rgba(250,252,255,0.96);
  border-color: rgba(148,176,226,0.45);
  color: #1f2b3e;
}
.neo-shell.theme-light .neo-input::placeholder { color: rgba(120,140,180,0.6); }
.neo-shell.theme-light .neo-json {
  background: rgba(245,248,255,0.95);
  border: 1px solid rgba(170,190,226,0.45);
  color: #374b8a;
}
.neo-shell.theme-light .neo-empty { color: rgba(110,132,180,0.76); }
.neo-shell.theme-light .neo-note { color: rgba(102,122,168,0.72); }
.neo-shell.theme-light .neo-detail-block {
  background: rgba(255,255,255,0.9);
  border-color: rgba(172,188,226,0.5);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);
}
.neo-shell.theme-light .neo-detail-title { color: rgba(72,96,146,0.7); }
.neo-shell.theme-light .neo-detail-value { color: #1c2a49; }
.neo-shell.theme-light .neo-timeline { color: rgba(92,114,158,0.7); }
.neo-shell.theme-light .neo-timeline strong { color: #22325a; }
.neo-shell.theme-light .neo-detail-meta { color: rgba(70,96,150,0.78); }
.neo-shell.theme-light .neo-detail-meta dd { color: rgba(36,56,108,0.9); }
`

function useLocalState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : initial
  })
  return [state, (v: T) => { setState(v); localStorage.setItem(key, JSON.stringify(v)) }] as const
}

export default function App() {
  const [tab, setTab] = useState<'orders' | 'tariffs' | 'settings' | 'users' | 'drivers'>('orders')
  const initialTheme = useMemo<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    return 'dark'
  }, [])
  const [theme, setTheme] = useLocalState<'dark' | 'light'>('tow_theme', initialTheme)
  const isLightTheme = theme === 'light'
  const [tariff, setTariffLocal] = useLocalState('tow_tariff', { base: 600, perKm: 40, per3min: 10 })
  const [tariffDraft, setTariffDraft] = useState(tariff)
  const [orders, setOrdersLocal] = useLocalState<any[]>('tow_orders', [])
  const [support, setSupportLocal] = useLocalState('tow_support', { phone: '+996 555 000-000', email: 'support@example.com' })
  const [info, setInfoLocal] = useLocalState('tow_info', { about: 'Сервис вызова эвакуатора.', version: '1.0', company: 'Tow Service' })
  const [users, setUsersLocal] = useLocalState<any[]>('tow_users', [])
  const [drivers, setDriversLocal] = useLocalState<any[]>('tow_drivers', [])
  const [activeChatUser, setActiveChatUser] = useState<any | null>(null)
  const [chat, setChat] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [userOrders, setUserOrders] = useState<any[]>([])
  const [selectedUserOrderId, setSelectedUserOrderId] = useState<string | number | null>(null)
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
  const [editing, setEditing] = useState<any | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | number | null>(null)
  const selectedOrder = useMemo(() => {
    if (selectedOrderId === null || selectedOrderId === undefined) return null
    return orders.find((o) => String(o?.id) === String(selectedOrderId)) || null
  }, [orders, selectedOrderId])
  const selectedDistanceKm = selectedOrder ? getDistanceKmValue(selectedOrder) : null
  const selectedDurationMins = selectedOrder ? getDurationMins(selectedOrder) : null
  const selectedCost = selectedOrder ? getCostValue(selectedOrder) : null
  const selectedUserOrder = useMemo(() => {
    if (selectedUserOrderId === null || selectedUserOrderId === undefined) return null
    return userOrders.find((o) => String(o?.id) === String(selectedUserOrderId)) || null
  }, [userOrders, selectedUserOrderId])
  const selectedUserDistanceKm = selectedUserOrder ? getDistanceKmValue(selectedUserOrder) : null
  const selectedUserDurationMins = selectedUserOrder ? getDurationMins(selectedUserOrder) : null
  const selectedUserCost = selectedUserOrder ? getCostValue(selectedUserOrder) : null

  useEffect(() => {
    if (typeof document === 'undefined') return
    const { body, documentElement } = document
    body.dataset.theme = theme
    body.classList.toggle('theme-light', isLightTheme)
    body.classList.toggle('theme-dark', !isLightTheme)
    documentElement.style.setProperty('color-scheme', theme)
    return () => {
      delete body.dataset.theme
      body.classList.remove('theme-light', 'theme-dark')
      documentElement.style.removeProperty('color-scheme')
    }
  }, [isLightTheme, theme])

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
      } catch {
        console.warn('Backend not available, using local data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'orders') return
    let timer: any = null
    const tick = async () => {
      try {
        const list = await api('/orders')
        setOrdersLocal(list)
      } catch {
        // ignore
      }
      timer = setTimeout(tick, 5000)
    }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])

  useEffect(() => {
    if (tab !== 'users') return
    let timer: any = null
    const tick = async () => {
      try { setUsersLocal(await api('/users')) } catch { /* ignore */ }
      timer = setTimeout(tick, 8000)
    }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])

  useEffect(() => {
    if (tab !== 'drivers') return
    let timer: any = null
    const tick = async () => {
      try { setDriversLocal(await api('/drivers')) } catch { /* ignore */ }
      timer = setTimeout(tick, 8000)
    }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [tab])

  useEffect(() => { setSupportDraft(support) }, [support])
  useEffect(() => { setInfoDraft(info) }, [info])
  useEffect(() => { setTariffDraft(tariff) }, [tariff])
  useEffect(() => {
    if (!savedTariffAt) return
    const t = setTimeout(() => setSavedTariffAt(0), 2000)
    return () => clearTimeout(t)
  }, [savedTariffAt])
  useEffect(() => {
    if (!savedSupportAt) return
    const t = setTimeout(() => setSavedSupportAt(0), 2000)
    return () => clearTimeout(t)
  }, [savedSupportAt])
  useEffect(() => {
    if (!savedInfoAt) return
    const t = setTimeout(() => setSavedInfoAt(0), 2000)
    return () => clearTimeout(t)
  }, [savedInfoAt])

  useEffect(() => {
    const base = (typeof localStorage !== 'undefined' && (localStorage.getItem('tow_api_base') || '')) || (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4001'
    const wsUrl = base.replace(/^http/, 'ws') + '/ws/admin'
    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl)
        adminWsRef.current = ws
        setAdminWs(ws)
        ws.onopen = () => { reconnectAttemptsRef.current = 0 }
        ws.onmessage = (ev) => {
          try {
            const message = JSON.parse(ev.data)
            if (message?.type === 'message') {
              const data = message.data
              const selected = activeChatUserRef.current
              setChat((prev) => {
                if (!(selected && data.userId === selected.id)) return prev
                const next = prev.some((x) => x.id === data.id) ? prev : [...prev, data]
                try {
                  if (atBottomRef.current && chatBoxRef.current) {
                    requestAnimationFrame(() => {
                      const el = chatBoxRef.current!
                      el.scrollTop = el.scrollHeight
                    })
                  }
                } catch {
                  // ignore auto-scroll errors
                }
                return next
              })
            }
          } catch {
            // ignore parse errors
          }
        }
        ws.onclose = () => {
          if (!shouldReconnectRef.current) return
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current++), 10000)
          try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current) } catch {
            // ignore
          }
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
        ws.onerror = () => {
          // noop
        }
      } catch {
        // ignore
      }
    }
    connect()
    return () => {
      shouldReconnectRef.current = false
      try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current) } catch {
        // ignore
      }
      try { adminWsRef.current && adminWsRef.current.close() } catch {
        // ignore
      }
      setAdminWs(null)
    }
  }, [])

  const openUser = async (u: any) => {
    setActiveChatUser(u)
    activeChatUserRef.current = u
    try {
      const [history, ordersList] = await Promise.all([
        api(`/users/${u.id}/chat`).catch(() => []),
        api(`/users/${u.id}/orders`).catch(() => []),
      ])
      setChat(history as any[])
      setUserOrders(ordersList as any[])
      setSelectedUserOrderId(null)
      setTimeout(() => {
        try {
          if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
          }
        } catch {
          // ignore
        }
      }, 0)
    } catch {
      setChat([])
      setUserOrders([])
      setSelectedUserOrderId(null)
    }
  }

  const sendAdminMessage = async () => {
    if (!activeChatUser || !chatInput.trim()) return
    const payload = { userId: activeChatUser.id, text: chatInput.trim() }
    const ws = adminWsRef.current
    const ready = !!ws && ws.readyState === WebSocket.OPEN
    if (ready) {
      try {
        ws.send(JSON.stringify(payload))
        setChatInput('')
      } catch {
        // ignore
      }
    } else {
      try {
        await api(`/users/${activeChatUser.id}/chat`, { method: 'POST', body: JSON.stringify({ text: chatInput.trim(), sender: 'admin' }) })
        setChatInput('')
      } catch {
        // ignore
      }
    }
  }

  const tariffJson = useMemo(() => JSON.stringify(tariff, null, 2), [tariff])
  const ordersJson = useMemo(() => JSON.stringify(orders, null, 2), [orders])

  const saveTariff = async (next: any) => {
    setTariffLocal(next)
    try { await api('/tariff', { method: 'PUT', body: JSON.stringify(next) }) } catch {
      // ignore
    }
  }

  const commitTariff = async () => {
    setSavingTariff(true)
    await saveTariff(tariffDraft)
    setSavingTariff(false)
    setSavedTariffAt(Date.now())
  }

  const cancelTariff = () => setTariffDraft(tariff)

  const clearOrders = async () => {
    setSelectedOrderId(null)
    setOrdersLocal([])
    try { await api('/orders', { method: 'DELETE' }) } catch {
      // ignore
    }
  }

  const startEdit = async (id: string | number) => {
    const key = String(id)
    setSelectedOrderId(key)
    try {
      const order = await api(`/orders/${key}`)
      setEditing(order)
    } catch {
      // ignore
    }
  }

  const saveOrder = async () => {
    if (!editing?.id) return
    try {
      await api(`/orders/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing) })
      setEditing(null)
      try {
        const list = await api('/orders')
        setOrdersLocal(list)
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  const cancelEdit = () => setEditing(null)

  const saveSupport = async (next: any) => {
    setSupportLocal(next)
    try { await api('/support', { method: 'PUT', body: JSON.stringify(next) }) } catch {
      // ignore
    }
  }

  const saveInfo = async (next: any) => {
    setInfoLocal(next)
    try { await api('/info', { method: 'PUT', body: JSON.stringify(next) }) } catch {
      // ignore
    }
  }

  const shellClassName = `neo-shell theme-${theme}`
  useEffect(() => {
    if (selectedUserOrderId === null || selectedUserOrderId === undefined) return
    const exists = userOrders.some((o) => String(o?.id) === String(selectedUserOrderId))
    if (!exists) setSelectedUserOrderId(null)
  }, [selectedUserOrderId, userOrders])
  const themeToggleText = isLightTheme ? 'Тема: светлая' : 'Тема: тёмная'
  const themeToggleTitle = isLightTheme ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'
  const toggleTheme = () => setTheme(isLightTheme ? 'dark' : 'light')
  const wsConnected = adminWs?.readyState === WebSocket.OPEN
  const tariffSavedText = savedTariffAt ? `Сохранено ${new Date(savedTariffAt).toLocaleTimeString()}` : ''
  const supportSavedText = savedSupportAt ? `Сохранено ${new Date(savedSupportAt).toLocaleTimeString()}` : ''
  const infoSavedText = savedInfoAt ? `Сохранено ${new Date(savedInfoAt).toLocaleTimeString()}` : ''

  return (
    <div className={shellClassName}>
      <style>{GLOBAL_STYLES}</style>
      <div className="neo-frame">
        <header className="neo-header">
          <div className="neo-title-block">
            <div className="neo-title">Tow Service</div>
            <div className="neo-subtitle">Админ-консоль</div>
          </div>
          <div className="neo-row">
            <div className="neo-api">
              <label htmlFor="api-base">API</label>
              <input
                id="api-base"
                className="neo-input"
                placeholder="http://localhost:4001"
                defaultValue={(typeof localStorage !== 'undefined' && localStorage.getItem('tow_api_base')) || ''}
                onBlur={(e) => { try { localStorage.setItem('tow_api_base', e.target.value || ''); location.reload() } catch { /* ignore */ } }}
              />
            </div>
            <button
              type="button"
              className={`neo-button is-ghost${isLightTheme ? ' is-active' : ''}`}
              onClick={toggleTheme}
              aria-label={themeToggleTitle}
              title={themeToggleTitle}
            >
              {themeToggleText}
            </button>
            {tab === 'tariffs' && (
              <button className={`neo-button is-ghost${showJson ? ' is-active' : ''}`} onClick={() => setShowJson((v) => !v)}>
                {showJson ? 'Скрыть JSON' : 'JSON тарифа'}
              </button>
            )}
            <button className={`neo-button is-ghost${loading ? ' is-active' : ''}`} onClick={refreshData} disabled={loading}>
              {loading ? 'Обновление…' : 'Обновить'}
            </button>
          </div>
        </header>

        <nav className="neo-tabs">
          <button className={`neo-tab${tab === 'orders' ? ' is-active' : ''}`} onClick={() => setTab('orders')}>Заказы</button>
          <button className={`neo-tab${tab === 'tariffs' ? ' is-active' : ''}`} onClick={() => setTab('tariffs')}>Тарифы</button>
          <button className={`neo-tab${tab === 'users' ? ' is-active' : ''}`} onClick={() => setTab('users')}>Пользователи</button>
          <button className={`neo-tab${tab === 'drivers' ? ' is-active' : ''}`} onClick={() => setTab('drivers')}>Водители</button>
          <button className={`neo-tab${tab === 'settings' ? ' is-active' : ''}`} onClick={() => setTab('settings')}>Настройки</button>
        </nav>

        <div className="neo-grid neo-bento">
          <div className="neo-card glass is-compact" aria-label="Сводка данных">
            <span className="neo-label">Сводка</span>
            <div className="neo-chip-grid">
              <div className="neo-chip">
                <span>Заказы</span>
                <strong>{orders.length}</strong>
              </div>
              <div className="neo-chip">
                <span>Пользователи</span>
                <strong>{users.length}</strong>
              </div>
              <div className="neo-chip">
                <span>Водители</span>
                <strong>{drivers.length}</strong>
              </div>
            </div>
          </div>
          <div className="neo-card glass is-compact" aria-label="Коммуникация">
            <span className="neo-label">Коммуникация</span>
            <div className="neo-chip-grid">
              <div className="neo-chip">
                <span>Сообщений</span>
                <strong>{chat.length}</strong>
              </div>
              <div className="neo-chip">
                <span>WS статус</span>
                <strong>{wsConnected ? 'Online' : 'Offline'}</strong>
              </div>
            </div>
          </div>
          <div className="neo-card glass is-compact" aria-label="Тарифы">
            <span className="neo-label">Тариф</span>
            <div className="neo-chip-grid">
              <div className="neo-chip">
                <span>База</span>
                <strong>{tariff.base} сом</strong>
              </div>
              <div className="neo-chip">
                <span>За км</span>
                <strong>{tariff.perKm} сом</strong>
              </div>
              <div className="neo-chip">
                <span>За 3 мин</span>
                <strong>{tariff.per3min} сом</strong>
              </div>
            </div>
          </div>
        </div>

        <main className="neo-main">
          {tab === 'tariffs' && (
            <div className="neo-stack">
              <section className="neo-card">
                <h3>Тарифы</h3>
                <div className="neo-form-grid two">
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="tariff-base">База, сом</label>
                    <input id="tariff-base" type="number" className="neo-input" value={tariffDraft.base} onChange={(e) => setTariffDraft({ ...tariffDraft, base: Number(e.target.value) })} />
                  </div>
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="tariff-perkm">За км, сом</label>
                    <input id="tariff-perkm" type="number" className="neo-input" value={tariffDraft.perKm} onChange={(e) => setTariffDraft({ ...tariffDraft, perKm: Number(e.target.value) })} />
                  </div>
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="tariff-per3min">За каждые 3 минуты, сом</label>
                    <input id="tariff-per3min" type="number" className="neo-input" value={tariffDraft.per3min} onChange={(e) => setTariffDraft({ ...tariffDraft, per3min: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="neo-row">
                  <button className="neo-button" disabled={savingTariff} onClick={commitTariff}>{savingTariff ? 'Сохранение…' : 'Сохранить'}</button>
                  <button className="neo-button is-ghost" disabled={savingTariff} onClick={cancelTariff}>Отменить</button>
                  {tariffSavedText && <span className="neo-status">{tariffSavedText}</span>}
                </div>
                <div className="neo-note">Нажмите «Сохранить», чтобы отправить изменения на сервер.</div>
              </section>
              {showJson && (
                <section className="neo-card glass">
                  <pre className="neo-json">{tariffJson}</pre>
                </section>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="neo-stack">
              <section className="neo-card">
                <div className="neo-row between">
                  <h3>Заказы</h3>
                  <span className="neo-pill">Всего {orders.length}</span>
                </div>
                {orders.length === 0 ? (
                  <div className="neo-empty">Заказов пока нет</div>
                ) : (
                  <table className="neo-table">
                    <thead>
                      <tr>
                        <th>Адрес</th>
                        <th>Дистанция</th>
                        <th>Время</th>
                        <th>Сумма</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o, idx) => {
                        const isSelected = selectedOrderId !== null && String(o?.id) === String(selectedOrderId)
                        const distanceKm = getDistanceKmValue(o)
                        const durationMins = getDurationMins(o)
                        const costValue = getCostValue(o)
                        const fromAddress = coalesce<string>(o?.fromAddress, o?.from_address, o?.details?.fromAddress, o?.meta?.fromAddress)
                        const toAddress = coalesce<string>(o?.toAddress, o?.to_address, o?.details?.toAddress, o?.meta?.toAddress)
                        const routeLabel = fromAddress && toAddress
                          ? `${fromAddress} → ${toAddress}`
                          : coalesce<string>(o?.address, fromAddress) || '—'
                        return (
                          <tr key={o?.id || idx} className={isSelected ? 'is-selected' : undefined}>
                            <td onClick={() => { if (o?.id !== undefined && o?.id !== null) setSelectedOrderId(o.id) }} className="neo-clickable">{routeLabel}</td>
                            <td>{formatDistanceKm(distanceKm)}</td>
                            <td>{formatDurationMins(durationMins)}</td>
                            <td>{formatSom(costValue)}</td>
                            <td>
                              <div className="neo-row end">
                                <button
                                  className={`neo-button tiny is-ghost${isSelected ? ' is-active' : ''}`}
                                  onClick={() => { if (o?.id !== undefined && o?.id !== null) setSelectedOrderId(o.id) }}
                                >
                                  Детали
                                </button>
                                <button className="neo-button tiny is-ghost" onClick={() => startEdit(o.id)}>Редактировать</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                <div className="neo-orders-controls">
                  <button className="neo-button is-danger" onClick={clearOrders}>Очистить</button>
                  <button className="neo-button is-ghost" onClick={() => navigator.clipboard.writeText(ordersJson)}>Копировать JSON</button>
                </div>
              </section>
              {selectedOrder && (
                <OrderDetailsCard
                  order={selectedOrder}
                  distanceKm={selectedDistanceKm}
                  durationMins={selectedDurationMins}
                  costValue={selectedCost}
                  onClose={() => setSelectedOrderId(null)}
                  onEdit={() => { if (selectedOrder?.id !== undefined && selectedOrder?.id !== null) startEdit(selectedOrder.id) }}
                />
              )}
              {editing && (
                <section className="neo-card neo-edit-card">
                  <h3>Редактирование заявки</h3>
                  <div className="neo-form-grid two">
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-from">Адрес A</label>
                      <input id="order-from" className="neo-input" value={editing.fromAddress || ''} onChange={(e) => setEditing({ ...editing, fromAddress: e.target.value })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-to">Адрес B</label>
                      <input id="order-to" className="neo-input" value={editing.toAddress || ''} onChange={(e) => setEditing({ ...editing, toAddress: e.target.value })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-driver">Имя водителя</label>
                      <input id="order-driver" className="neo-input" value={editing.details?.driverName || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), driverName: e.target.value } })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-make">Авто (марка)</label>
                      <input id="order-make" className="neo-input" value={editing.details?.vehicleMake || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), vehicleMake: e.target.value } })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-model">Авто (модель)</label>
                      <input id="order-model" className="neo-input" value={editing.details?.vehicleModel || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), vehicleModel: e.target.value } })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-plate">Гос. номер</label>
                      <input id="order-plate" className="neo-input" value={editing.details?.plateNumber || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), plateNumber: e.target.value } })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-color">Цвет</label>
                      <input id="order-color" className="neo-input" value={editing.details?.vehicleColor || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), vehicleColor: e.target.value } })} />
                    </div>
                    <div className="neo-form-item">
                      <label className="neo-label" htmlFor="order-notes">Заметки</label>
                      <input id="order-notes" className="neo-input" value={editing.details?.notes || ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), notes: e.target.value } })} />
                    </div>
                  </div>
                  <div className="neo-row">
                    <button className="neo-button" onClick={saveOrder}>Сохранить</button>
                    <button className="neo-button is-ghost" onClick={cancelEdit}>Отмена</button>
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="neo-grid">
              <section className="neo-card slate">
                <h3>Служба поддержки</h3>
                <div className="neo-form-grid">
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="support-phone">Телефон</label>
                    <input id="support-phone" className="neo-input" value={supportDraft.phone} onChange={(e) => setSupportDraft({ ...supportDraft, phone: e.target.value })} />
                  </div>
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="support-email">Email</label>
                    <input id="support-email" className="neo-input" type="email" value={supportDraft.email} onChange={(e) => setSupportDraft({ ...supportDraft, email: e.target.value })} />
                  </div>
                </div>
                <div className="neo-row">
                  <button className="neo-button" disabled={savingSupport} onClick={async () => { setSavingSupport(true); await saveSupport(supportDraft); setSavingSupport(false); setSavedSupportAt(Date.now()) }}>
                    {savingSupport ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button className="neo-button is-ghost" disabled={savingSupport} onClick={() => setSupportDraft(support)}>
                    Отменить
                  </button>
                  {supportSavedText && <span className="neo-status">{supportSavedText}</span>}
                </div>
                <div className="neo-note">Нажмите «Сохранить», чтобы отправить изменения на сервер.</div>
              </section>
              <section className="neo-card slate">
                <h3>Информация</h3>
                <div className="neo-form-grid">
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="info-about">О сервисе</label>
                    <textarea id="info-about" className="neo-textarea" rows={4} value={infoDraft.about} onChange={(e) => setInfoDraft({ ...infoDraft, about: e.target.value })} />
                  </div>
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="info-version">Версия</label>
                    <input id="info-version" className="neo-input" value={infoDraft.version} onChange={(e) => setInfoDraft({ ...infoDraft, version: e.target.value })} />
                  </div>
                  <div className="neo-form-item">
                    <label className="neo-label" htmlFor="info-company">Компания</label>
                    <input id="info-company" className="neo-input" value={infoDraft.company} onChange={(e) => setInfoDraft({ ...infoDraft, company: e.target.value })} />
                  </div>
                </div>
                <div className="neo-row">
                  <button className="neo-button" disabled={savingInfo} onClick={async () => { setSavingInfo(true); await saveInfo(infoDraft); setSavingInfo(false); setSavedInfoAt(Date.now()) }}>
                    {savingInfo ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button className="neo-button is-ghost" disabled={savingInfo} onClick={() => setInfoDraft(info)}>
                    Отменить
                  </button>
                  {infoSavedText && <span className="neo-status">{infoSavedText}</span>}
                </div>
                <div className="neo-note">Нажмите «Сохранить», чтобы отправить изменения на сервер.</div>
              </section>
            </div>
          )}

          {tab === 'users' && !activeChatUser && (
            <section className="neo-card">
              <div className="neo-row between">
                <h3>Пользователи</h3>
                <span className="neo-pill">Всего {users.length}</span>
              </div>
              <UsersTable rows={users} onOpenUser={openUser} />
            </section>
          )}

          {tab === 'users' && activeChatUser && (
            <div className="neo-stack">
              <div className="neo-row between">
                <button className="neo-back" onClick={() => { setActiveChatUser(null); setChat([]); setUserOrders([]); setSelectedUserOrderId(null) }}>← Назад</button>
                <span className="neo-status">{activeChatUser.name || activeChatUser.phone || 'Пользователь'}</span>
                <span className="neo-status">ID {activeChatUser.id}</span>
              </div>
              <div className="neo-chat-layout">
                <section className="neo-card slate">
                  <div className="neo-chip-grid">
                    <div className="neo-chip">
                      <span>Телефон</span>
                      <strong>{activeChatUser.phone || '—'}</strong>
                    </div>
                    <div className="neo-chip">
                      <span>Имя</span>
                      <strong>{activeChatUser.name || '—'}</strong>
                    </div>
                    <div className="neo-chip">
                      <span>Роль</span>
                      <strong>{activeChatUser.role || 'customer'}</strong>
                    </div>
                    <div className="neo-chip">
                      <span>Создан</span>
                      <strong>{activeChatUser.createdAt ? new Date(activeChatUser.createdAt).toLocaleString() : '—'}</strong>
                    </div>
                  </div>
                  <div className="neo-chat">
                    <div
                      ref={chatBoxRef}
                      className="neo-chat-box"
                      onScroll={(e) => {
                        try {
                          const el = e.currentTarget as HTMLDivElement
                          const threshold = 60
                          atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
                        } catch {
                          atBottomRef.current = true
                        }
                      }}
                    >
                      {chat.length === 0 ? (
                        <div className="neo-chat-empty">Сообщений пока нет</div>
                      ) : (
                        chat.map((m: any) => (
                          <div key={m.id} className={`neo-bubble-row ${m.sender === 'admin' ? 'admin' : 'user'}`}>
                            <div className={`neo-bubble${m.sender === 'admin' ? '' : ' user'}`}>
                              <small>{m.sender === 'admin' ? 'Админ' : 'Пользователь'}</small>
                              <div>{m.text}</div>
                              <small>{new Date(m.createdAt).toLocaleTimeString()}</small>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="neo-chat-controls">
                      <textarea className="neo-textarea" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Введите сообщение" rows={2} />
                      <button className="neo-button" onClick={sendAdminMessage}>Отправить</button>
                    </div>
                  </div>
                </section>
                <section className="neo-card glass">
                  <div className="neo-row between">
                    <h3>Заказы пользователя</h3>
                    <button className="neo-button tiny is-ghost" onClick={async () => { try { const list = await api(`/users/${activeChatUser.id}/orders`); setUserOrders(list); setSelectedUserOrderId(null) } catch { /* ignore */ } }}>Обновить</button>
                  </div>
                  {userOrders.length === 0 ? (
                    <div className="neo-empty">Нет заказов</div>
                  ) : (
                    <table className="neo-table">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Откуда → Куда</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userOrders.map((o: any, idx: number) => {
                          const isSelected = selectedUserOrderId !== null && String(o?.id) === String(selectedUserOrderId)
                          const created = o?.createdAt ? new Date(o.createdAt).toLocaleString() : '—'
                          const fromAddress = coalesce<string>(o?.fromAddress, o?.from_address, o?.details?.fromAddress)
                          const toAddress = coalesce<string>(o?.toAddress, o?.to_address, o?.details?.toAddress)
                          const addressFallback = coalesce<string>(o?.address, o?.meta?.fromAddress)
                          const displayRoute = (() => {
                            if (fromAddress && toAddress) return `${fromAddress} → ${toAddress}`
                            if (fromAddress) return fromAddress
                            if (toAddress) return `→ ${toAddress}`
                            if (addressFallback) return addressFallback
                            return '—'
                          })()
                          const costValue = getCostValue(o)
                          return (
                            <tr key={o?.id || idx} className={isSelected ? 'is-selected' : undefined}>
                              <td className="neo-clickable" onClick={() => { if (o?.id !== undefined && o?.id !== null) setSelectedUserOrderId(o.id) }}>{created}</td>
                              <td className="neo-clickable" onClick={() => { if (o?.id !== undefined && o?.id !== null) setSelectedUserOrderId(o.id) }}>{displayRoute}</td>
                              <td className="neo-clickable" onClick={() => { if (o?.id !== undefined && o?.id !== null) setSelectedUserOrderId(o.id) }}>{formatSom(costValue)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {selectedUserOrder && (
                    <OrderDetailsCard
                      order={selectedUserOrder}
                      distanceKm={selectedUserDistanceKm}
                      durationMins={selectedUserDurationMins}
                      costValue={selectedUserCost}
                      onClose={() => setSelectedUserOrderId(null)}
                      onEdit={() => { if (selectedUserOrder?.id !== undefined && selectedUserOrder?.id !== null) startEdit(selectedUserOrder.id) }}
                    />
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === 'drivers' && (
            <section className="neo-card">
              <div className="neo-row between">
                <h3>Водители</h3>
                <span className="neo-pill">Всего {drivers.length}</span>
              </div>
              <DriversTable rows={drivers} />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function UsersTable({ rows, onOpenUser }: { rows: any[], onOpenUser?: (u: any) => void }) {
  if (!rows?.length) return <div className="neo-empty">Нет пользователей</div>
  const fmt = (ts?: number) => ts ? new Date(ts).toLocaleString() : '—'
  return (
    <table className="neo-table">
      <thead>
        <tr>
          <th>Телефон</th>
          <th>Имя</th>
          <th>Роль</th>
          <th>Создан</th>
          {onOpenUser && <th>Действия</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id}>
            <td className={onOpenUser ? 'neo-clickable' : ''} onClick={() => onOpenUser && onOpenUser(r)}>{r.phone || '—'}</td>
            <td className={onOpenUser ? 'neo-clickable' : ''} onClick={() => onOpenUser && onOpenUser(r)}>{r.name || '—'}</td>
            <td>{r.role || 'customer'}</td>
            <td>{fmt(r.createdAt)}</td>
            {onOpenUser && (
              <td>
                <button className="neo-button tiny is-ghost" onClick={() => onOpenUser(r)}>Открыть</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DriversTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <div className="neo-empty">Нет водителей</div>
  const fmt = (ts?: number) => ts ? new Date(ts).toLocaleString() : '—'
  return (
    <table className="neo-table">
      <thead>
        <tr>
          <th>Телефон</th>
          <th>Имя</th>
          <th>Авто</th>
          <th>Гос. номер</th>
          <th>Создан</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id}>
            <td>{r.phone || '—'}</td>
            <td>{r.name || '—'}</td>
            <td>{r.car || '—'}</td>
            <td>{r.plate || '—'}</td>
            <td>{fmt(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type OrderDetailsCardProps = {
  order: any
  distanceKm: number | null
  durationMins: number | null
  costValue: number | null
  onClose: () => void
  onEdit: () => void
}

function OrderDetailsCard({ order, distanceKm, durationMins, costValue, onClose, onEdit }: OrderDetailsCardProps) {
  const details = order?.details || {}
  const fromAddress = coalesce<string>(order?.fromAddress, order?.from_address, details?.fromAddress, details?.addressFrom, order?.meta?.fromAddress)
  const toAddress = coalesce<string>(order?.toAddress, order?.to_address, details?.toAddress, details?.addressTo, order?.meta?.toAddress)
  const routeSummary = fromAddress && toAddress ? `${fromAddress} → ${toAddress}` : coalesce<string>(order?.address, fromAddress)
  const startCoords = order?.startCoords || order?.start_coords || details?.startCoords
  const destCoords = order?.destCoords || order?.dest_coords || details?.destCoords
  const status = coalesce<string>(order?.status, details?.status)
  const statusLabel = status ? STATUS_LABELS[status] || status : '—'
  const paymentMethod = coalesce<string>(order?.paymentMethod, order?.meta?.paymentMethod, details?.paymentMethod)
  const driverName = coalesce<string>(order?.driverName, details?.driverName, order?.meta?.driverName)
  const driverPhone = coalesce<string>(order?.driverPhone, details?.driverPhone, order?.meta?.driverPhone)
  const vehicleMake = coalesce<string>(order?.vehicleMake, details?.vehicleMake, order?.meta?.vehicleMake)
  const vehicleModel = coalesce<string>(order?.vehicleModel, details?.vehicleModel, order?.meta?.vehicleModel)
  const vehicle = [vehicleMake, vehicleModel].filter(Boolean).join(' ')
  const plate = coalesce<string>(order?.plateNumber, details?.plateNumber, order?.meta?.plateNumber)
  const vehicleColor = coalesce<string>(order?.vehicleColor, details?.vehicleColor, order?.meta?.vehicleColor)
  const notes = coalesce<string>(order?.notes, details?.notes, order?.meta?.notes, order?.meta?.comment)
  const customerName = coalesce<string>(order?.customerName, order?.user?.name, order?.userName, order?.meta?.customerName)
  const customerPhone = coalesce<string>(order?.customerPhone, order?.user?.phone, order?.meta?.customerPhone)
  const createdAt = order?.createdAt ?? order?.created_at ?? details?.createdAt
  const startedAt = order?.startedAt ?? order?.started_at ?? details?.startedAt
  const arrivedAt = order?.arrivedAt ?? order?.arrived_at ?? details?.arrivedAt
  const updatedAt = order?.updatedAt ?? order?.updated_at ?? details?.updatedAt
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const summaryJson = useMemo(() => {
    try { return JSON.stringify(order, null, 2) } catch { return '' }
  }, [order])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  const copyJson = async () => {
    if (!summaryJson) return
    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryJson)
        setCopied(true)
      }
    } catch {
      setCopied(false)
    }
  }
  const metaEntries = useMemo(() => {
    if (!order?.meta || typeof order.meta !== 'object') return [] as Array<[string, string]>
    const omit = new Set([
      'distancekm', 'distance', 'distancekm', 'durationminutes', 'durationmins', 'durationsec', 'finalcost',
      'total', 'paymentmethod', 'drivername', 'driverphone', 'fromaddress', 'toaddress', 'notes', 'comment',
      'customername', 'customerphone', 'vehiclemake', 'vehiclemodel', 'platenumber', 'vehiclecolor', 'startcoords', 'destcoords',
    ])
    return Object.entries(order.meta)
      .filter(([key, value]) => {
        if (value === null || value === undefined || value === '') return false
        if (omit.has(String(key).toLowerCase())) return false
        return true
      })
      .map(([key, value]) => {
        if (typeof value === 'object') {
          try { return [key, JSON.stringify(value)] as [string, string] } catch { return [key, '[object]'] as [string, string] }
        }
        return [key, String(value)] as [string, string]
      })
  }, [order])
  const timeline = useMemo(() => ([
    { label: 'Создан', value: formatDateTime(createdAt) },
    { label: 'Начало', value: formatDateTime(startedAt) },
    { label: 'Завершён', value: formatDateTime(arrivedAt) },
    { label: 'Обновлён', value: formatDateTime(updatedAt) },
  ]), [arrivedAt, createdAt, startedAt, updatedAt])
  const canEdit = order?.id !== undefined && order?.id !== null
  return (
    <section className="neo-card glass neo-detail-card">
      <div className="neo-row between">
        <div className="neo-row">
          <h3>Детали заказа</h3>
          {order?.id ? <span className="neo-pill">ID {order.id}</span> : null}
        </div>
        <div className="neo-row end">
          {copied && <span className="neo-status">Скопировано</span>}
          <button className={`neo-button tiny is-ghost${showRaw ? ' is-active' : ''}`} onClick={() => setShowRaw((v) => !v)} disabled={!summaryJson}>
            {showRaw ? 'Скрыть JSON' : 'Показать JSON'}
          </button>
          <button className="neo-button tiny is-ghost" onClick={copyJson} disabled={!summaryJson}>Скопировать JSON</button>
          <button className="neo-button tiny" onClick={onEdit} disabled={!canEdit}>Редактировать</button>
          <button className="neo-button tiny is-ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
      <div className="neo-detail-grid">
        <div className="neo-detail-block">
          <span className="neo-detail-title">Маршрут</span>
          <span className="neo-detail-value">{fromAddress || '—'}</span>
          <span className="neo-detail-value">{toAddress || '—'}</span>
          {routeSummary && (routeSummary !== fromAddress || !toAddress) ? <span className="neo-detail-value">{routeSummary}</span> : null}
          {startCoords ? <span className="neo-detail-value">Старт: {formatCoords(startCoords)}</span> : null}
          {destCoords ? <span className="neo-detail-value">Финиш: {formatCoords(destCoords)}</span> : null}
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Статус</span>
          <span className="neo-detail-value neo-detail-em">{statusLabel}</span>
          {status && statusLabel !== status ? <span className="neo-detail-value">({status})</span> : null}
          <span className="neo-detail-title">Оплата</span>
          <span className="neo-detail-value">{paymentMethod || '—'}</span>
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Расчёт</span>
          <span className="neo-detail-value">Стоимость: {formatSom(costValue)}</span>
          <span className="neo-detail-value">Расстояние: {formatDistanceKm(distanceKm)}</span>
          <span className="neo-detail-value">Длительность: {formatDurationMins(durationMins)}</span>
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Водитель</span>
          <span className="neo-detail-value">{driverName || '—'}</span>
          <span className="neo-detail-value">Телефон: {driverPhone || '—'}</span>
          <span className="neo-detail-value">Авто: {vehicle || '—'}</span>
          <span className="neo-detail-value">Номер: {plate || '—'}</span>
          <span className="neo-detail-value">Цвет: {vehicleColor || '—'}</span>
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Клиент</span>
          <span className="neo-detail-value">{customerName || '—'}</span>
          <span className="neo-detail-value">Телефон: {customerPhone || '—'}</span>
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Таймлайн</span>
          <div className="neo-timeline">
            {timeline.map((item) => (
              <span key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="neo-detail-block">
          <span className="neo-detail-title">Примечания</span>
          <span className="neo-detail-value">{notes || '—'}</span>
        </div>
        {metaEntries.length > 0 && (
          <div className="neo-detail-block">
            <span className="neo-detail-title">Дополнительно</span>
            <dl className="neo-detail-meta">
              {metaEntries.map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
      </div>
      {showRaw && summaryJson ? <pre className="neo-json is-inline">{summaryJson}</pre> : null}
    </section>
  )
}
