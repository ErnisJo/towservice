import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, TextInput, ActivityIndicator, Keyboard, NativeModules, Platform, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import MapViewProvider from './MapViewProvider';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { on as onEvent } from '../utils/eventBus';
import { useFocusEffect } from '@react-navigation/native';

// Карта показывается только после получения геопозиции пользователя
export default function HomeScreen({ navigation }) {
  const watchRef = useRef(null);
  const geocodeCacheRef = useRef(new Map());

  // Общие HTTP-заголовки для вежливых OSM сервисов
  const DEFAULT_HEADERS = {
    'User-Agent': 'TowServiceApp/1.0 (+https://towservice.local)',
    'Accept-Language': 'ru',
    'Referer': 'https://towservice.local',
  };

  const fetchJSON = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}), ...DEFAULT_HEADERS };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // Грубая проверка, что координаты внутри Кыргызстана (bbox)
  const isInKG = useCallback((lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= 39.0 && lat <= 44.0 && lon >= 69.0 && lon <= 81.0;
  }, []);

  const overpassQuery = useCallback(async (data) => {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
      'https://overpass.nchc.org.tw/api/interpreter',
    ];
    const q = `data=${encodeURIComponent(data)}`;
    let lastErr = null;
    for (const ep of endpoints) {
      // Try GET first
      try {
        const j = await fetchJSON(`${ep}?${q}`);
        if (j) return j;
      } catch (e) { lastErr = e; }
      // Fallback to POST (some mirrors prefer POST)
      try {
        const j = await fetchJSON(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: q,
        });
        if (j) return j;
      } catch (e2) { lastErr = e2; }
    }
    throw lastErr || new Error('Overpass failed');
  }, [fetchJSON]);

  // Удаляет из адреса упоминания области ("область", "обл.")
  const cleanRuAddress = useCallback((addr) => {
    if (!addr || typeof addr !== 'string') return addr;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = parts.filter(p => !/\bобл(?:\.|асть)?\b/i.test(p));
    return filtered.join(', ');
  }, []);

  const [region, setRegion] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [startIsManual, setStartIsManual] = useState(false);
  const startIsManualRef = useRef(false);
  const [destination, setDestination] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distance, distanceText, duration, durationText }
  const [pending, setPending] = useState(null); // { latitude, longitude, address? }
  const [addrA, setAddrA] = useState(null);
  const [addrB, setAddrB] = useState(null);
  const [startVisible, setStartVisible] = useState(true);
  const [activeField, setActiveField] = useState(null); // 'A' | 'B' | null
  const [suggestions, setSuggestions] = useState([]); // [{title, subtitle, latitude, longitude, address}]
  const [suggesting, setSuggesting] = useState(false);
  const suggestTimerRef = useRef(null);
  const [recenterTick, setRecenterTick] = useState(0);
  const [resetTick, setResetTick] = useState(0);
  const [clearDestTick, setClearDestTick] = useState(0);
  const [clearRouteTick, setClearRouteTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tariff, setTariff] = useState({ base: 600, perKm: 40, per3min: 10 });
  const [lastBuilt, setLastBuilt] = useState({ a: '', b: '' });
  const [isBuilding, setIsBuilding] = useState(false);
  const norm = useCallback((s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().toLowerCase()), []);
  const [lastBuildAt, setLastBuildAt] = useState(0);
  const [lastUserEditAt, setLastUserEditAt] = useState(0);
  // Встроенная авторизация перед заказом
  const [authOpen, setAuthOpen] = useState(false);
  const [authStep, setAuthStep] = useState(1); // 1: телефон, 2: код (+ имя при регистрации)
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authPhone, setAuthPhone] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authDevHint, setAuthDevHint] = useState('');
  const normPhone = useCallback((s) => (s ? String(s).replace(/\D+/g, '') : ''), []);

  const [permissionStatus, setPermissionStatus] = useState('checking'); // 'checking' | 'granted' | 'prompt'
  const [canAskAgain, setCanAskAgain] = useState(true);
  const addrARef = useRef(null);
  const addrBRef = useRef(null);

  // Resolve API base for device (replace localhost with Metro host IP)
  const getApiBase = useCallback(() => {
    const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
    if (/localhost|127\.0\.0\.1/.test(cfg) && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:4001`;
      } catch (_) {}
    }
    return cfg;
  }, []);

  // Load tariff on screen focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        try {
          const base = getApiBase();
          const res = await fetch(base + '/tariff?t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled && j && typeof j === 'object') {
              const next = {
                base: Number(j.base) || 600,
                perKm: Number(j.perKm) || 40,
                per3min: Number(j.per3min) || 10,
              };
        setTariff(next);
            }
          }
        } catch (_) {}
      };
      run();
      // Poll for tariff updates while focused
      const timer = setInterval(run, 10000);
      return () => { cancelled = true; clearInterval(timer); };
    }, [getApiBase])
  );

  // Запросить код (dev: сервер возвращает devCode)
  const authRequestCode = useCallback(async () => {
  const p = normPhone(authPhone.trim());
    if (!p) { Alert.alert('Ошибка', 'Введите номер телефона'); return; }
    setAuthLoading(true);
    setAuthDevHint('');
    try {
  const base = getApiBase();
      // helper: fetch with timeout
      const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
        const controller = new AbortController();
        const id = setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs);
        try { return await fetch(url, { ...(options||{}), signal: controller.signal }); }
        finally { clearTimeout(id); }
      };
      let res = await fetchWithTimeout(base + '/auth/request-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p })
      });
  // no fallback to :4000 — используем только Python API на 4001
      if (!res.ok) throw new Error('bad');
      const j = await res.json();
      if (j?.devCode) setAuthDevHint(`Код (dev): ${j.devCode}`);
      // Определяем режим ТОЛЬКО по клиентской проверке /users (без опоры на серверный userExists)
      let exists = false; // по умолчанию считаем, что нет (чтобы новый номер переключал на регистрацию)
      try {
        const uRes = await fetchWithTimeout(base + '/users?t=' + Date.now(), { method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' }, 8000);
        if (uRes.ok) {
          const arr = await uRes.json();
          if (Array.isArray(arr)) {
            exists = arr.some(u => normPhone(u?.phone) === p);
          }
        }
      } catch {}
      setAuthMode(exists ? 'login' : 'register');
  setAuthStep(2);
    } catch (_) {
      Alert.alert('Ошибка', 'Не удалось отправить код');
    } finally { setAuthLoading(false); }
  }, [authPhone, getApiBase]);

  // Проверить код; если пользователь новый — используем имя для регистрации
  const authVerify = useCallback(async () => {
  const p = normPhone(authPhone.trim());
    const c = authCode.trim();
    if (!p || !c) { Alert.alert('Ошибка', 'Введите номер и код'); return; }
    setAuthLoading(true);
    try {
      const base = getApiBase();
      // reuse fetchWithTimeout from outer scope by redefining (function scope)
      const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
        const controller = new AbortController();
        const id = setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs);
        try { return await fetch(url, { ...(options||{}), signal: controller.signal }); }
        finally { clearTimeout(id); }
      };
  let res = await fetchWithTimeout(base + '/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p, code: c, ...(authName ? { name: authName.trim() } : {}) })
      });
  // no fallback to :4000 — используем только Python API на 4001
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'bad');
      if (j?.token) await AsyncStorage.setItem('tow_token', j.token);
      if (j?.user) await AsyncStorage.setItem('tow_user', JSON.stringify(j.user));
      // Успех: закрываем оверлей и продолжаем заказ
      setAuthOpen(false);
      setAuthStep(1);
  setAuthPhone(''); setAuthCode(''); setAuthName(''); setAuthDevHint(''); setAuthMode('login');
      await placeOrder();
    } catch (_) {
      Alert.alert('Ошибка', 'Неверный код');
    } finally { setAuthLoading(false); }
  }, [authPhone, authCode, authName, getApiBase, placeOrder]);

  // Быстрая метрика расстояния (м) для выбора ближайших объектов
  const distMeters = useCallback((a, b) => {
    const toRad = Math.PI / 180;
    const R = 6371000;
    const dLat = (b.lat - a.lat) * toRad;
    const dLon = (b.lon - a.lon) * toRad;
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLon / 2);
    const aa = s1 * s1 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * s2 * s2;
    return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  }, []);

  // Нормализация адресов определена ниже (одна активная версия)

  const hasHouseNumber = useCallback((addr) => {
    if (!addr) return false;
    const tail = addr.split(',').slice(1).join(',');
    return /,\s*\d/.test(addr) || /дом\s*\d/i.test(addr) || /\b\d+\s*(?:[A-Za-zА-Яа-я]|к\.?|корп\.?|с\.?|стр\.)?\s*\d*\b/.test(tail);
  }, []);

  // Вспомогательное: вытащить базовую «улицу» из адресной строки (для уточнения номера дома)
  const extractBaseStreet = useCallback((addr) => {
    if (!addr || typeof addr !== 'string') return null;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    if (parts.length >= 2 && /(район|округ|АО|административный округ)/i.test(parts[0])) {
      return parts[1];
    }
    return parts[0];
  }, []);

  const normalizeAddr = useCallback((addr) => {
    if (!addr) return null;
    // Минимальная нормализация: ничего не трогаем, только trim
    return typeof addr === 'string' ? addr.trim() : String(addr);
  }, []);

  // Поиск подсказок (организации/адреса) по вводу пользователя — только Кыргызстан
  const suggestPlaces = useCallback(async (query) => {
    const result = [];
    if (!query || typeof query !== 'string') return result;
    const raw = query.trim();
    if (raw.length < 2) return result;
    const narrowed = /киргиз|кыргыз|kyrgyz|kg/i.test(raw) ? raw : `Кыргызстан, ${raw}`;
    const q = encodeURIComponent(narrowed);
    const dgisKey = Constants?.expoConfig?.extra?.dgisApiKey;
    const liqKey = Constants?.expoConfig?.extra?.locationIqKey;

    // 1) 2GIS Items: лучшие подсказки по организациям/местам
    if (dgisKey) {
      try {
        const url = `https://catalog.api.2gis.com/3.0/items?q=${q}&fields=items.point,items.geometry.centroid,items.address_name,items.full_name,items.name&key=${dgisKey}&page_size=6`;
        const j = await fetchJSON(url);
        const items = j?.result?.items || [];
        items.forEach(it => {
          const p = it?.point || it?.geometry?.centroid || {};
          const lat = p?.lat ?? p?.latitude; const lon = p?.lon ?? p?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
            const title = it?.name || it?.full_name || it?.address_name || raw;
            const subtitle = it?.address_name || it?.full_name || '';
            result.push({ title: normalizeAddr(title), subtitle: normalizeAddr(subtitle), latitude: lat, longitude: lon, address: normalizeAddr(subtitle || title) });
          }
        });
      } catch (_) { /* ignore and fallback */ }
    }

    // 2) Fallback: LocationIQ поиск
    if (result.length < 3 && liqKey) {
      try {
        const url = `https://us1.locationiq.com/v1/search?format=json&q=${q}&addressdetails=1&accept-language=ru&countrycodes=kg&limit=6&key=${liqKey}`;
        const arr = await fetchJSON(url);
        if (Array.isArray(arr)) {
          arr.forEach(r => {
            const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
              const display = r.display_name || raw;
              const a = r?.address || {};
              const street = a.road || a.pedestrian || a.residential || a.footway || a.path || a.cycleway || a.highway;
              const house = a.house_number || a.building || a.house;
              const base = street ? (house ? `${street}, ${house}` : street) : display;
              result.push({ title: normalizeAddr(base), subtitle: normalizeAddr(display), latitude: lat, longitude: lon, address: normalizeAddr(base) });
            }
          });
        }
      } catch (_) {}
    }

    // 3) Fallback: Nominatim
    if (result.length < 3) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&addressdetails=1&accept-language=ru&countrycodes=kg&limit=6`;
        const arr = await fetchJSON(url);
        if (Array.isArray(arr)) {
          arr.forEach(r => {
            const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
              const display = r.display_name || raw;
              const a = r?.address || {};
              const street = a.road || a.pedestrian || a.residential || a.footway || a.path || a.cycleway || a.highway;
              const house = a.house_number || a.building || a.house;
              const base = street ? (house ? `${street}, ${house}` : street) : display;
              result.push({ title: normalizeAddr(base), subtitle: normalizeAddr(display), latitude: lat, longitude: lon, address: normalizeAddr(base) });
            }
          });
        }
      } catch (_) {}
    }

    // Уникализируем по координатам/названию и ограничим до 8
    const seen = new Set();
    const final = [];
    for (const it of result) {
      const key = `${it.title}|${it.latitude?.toFixed?.(5)},${it.longitude?.toFixed?.(5)}`;
      if (!seen.has(key)) { seen.add(key); final.push(it); }
      if (final.length >= 8) break;
    }
    return final;
  }, [fetchJSON, isInKG, normalizeAddr]);

  // Прямое геокодирование текстового адреса -> координаты и строка адреса
  const geocodeTextBest = useCallback(async (query) => {
    if (!query || typeof query !== 'string') return null;
    const raw = query.trim();
    const narrowedQ = /киргиз|кыргыз|kyrgyz|kg/i.test(raw) ? raw : `Кыргызстан, ${raw}`;
    const q = encodeURIComponent(narrowedQ);
    const yaKey = Constants?.expoConfig?.extra?.yandex?.apiKey;
    const gKey = Constants?.expoConfig?.extra?.googleMapsApiKey;
    const dgisKey = Constants?.expoConfig?.extra?.dgisApiKey;
    const liqKey = Constants?.expoConfig?.extra?.locationIqKey;

    // 0a) 2GIS items search — отлично ищет организации по названию
    if (dgisKey) {
      try {
        const url = `https://catalog.api.2gis.com/3.0/items?q=${q}&fields=items.point,items.geometry.centroid,items.address_name,items.full_name&key=${dgisKey}`;
        const j = await fetchJSON(url);
        const items = j?.result?.items || [];
        if (items.length) {
          // Берём первый попавшийся в пределах Кыргызстана
          for (const it of items) {
            const p = it?.point || it?.geometry?.centroid || {};
            const lat = p?.lat ?? p?.latitude; const lon = p?.lon ?? p?.longitude;
            if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
              const addr = normalizeAddr(it?.address_name || it?.full_name || raw);
              return { latitude: lat, longitude: lon, address: addr };
            }
          }
        }
      } catch(_) {}
    }

    // 0) Yandex Geocoder
    if (yaKey) {
      try {
        // Яндекс не имеет явного фильтра по стране, поэтому сужаем сам запрос префиксом "Кыргызстан"
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${yaKey}&format=json&geocode=${q}&lang=ru_RU&results=5`;
        const j = await fetchJSON(url);
        const fm = j?.response?.GeoObjectCollection?.featureMember;
        if (Array.isArray(fm) && fm.length) {
          const geo = fm[0]?.GeoObject;
          const md = geo?.metaDataProperty?.GeocoderMetaData;
          const comps = md?.Address?.Components || [];
          const street = (comps.find(c => c.kind === 'street' || c.kind === 'thoroughfare') || {})?.name;
          const house = (comps.find(c => c.kind === 'house') || {})?.name;
          const formatted = md?.Address?.formatted || md?.text || null;
          const posStr = geo?.Point?.pos || '';
          const [lonStr, latStr] = posStr.split(' ');
          const lat = parseFloat(latStr); const lon = parseFloat(lonStr);
          if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
            const addrTxt = normalizeAddr(street ? (house ? `${street}, ${house}` : street) : (formatted || query));
            return { latitude: lat, longitude: lon, address: addrTxt };
          }
        }
      } catch(_) {}
    }

    // 1) 2GIS forward
    if (dgisKey) {
      try {
        // Сужаем поисковую фразу префиксом страны
        const url = `https://catalog.api.2gis.com/3.0/items/geocode?q=${q}&key=${dgisKey}`;
        const j = await fetchJSON(url);
        const items = j?.result?.items || [];
        if (items.length) {
          const it = items[0];
          const p = it?.point || it?.geometry?.centroid || {};
          const lat = p?.lat ?? p?.latitude; const lon = p?.lon ?? p?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
            const addr = normalizeAddr(it?.address_name || it?.full_name || query);
            return { latitude: lat, longitude: lon, address: addr };
          }
        }
      } catch(_) {}
    }

    // 2) Google Geocoding
    if (gKey) {
      try {
        // Жёсткая фильтрация по стране через components=country:KG
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&language=ru&components=country:KG&key=${gKey}`;
        const j = await fetchJSON(url);
        if (j && Array.isArray(j.results) && j.results.length) {
          const r = j.results[0];
          const loc = r?.geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && isInKG(loc.lat, loc.lng)) {
            const comps = r.address_components || [];
            const route = (comps.find(c => c.types?.includes('route')) || {}).long_name;
            const num = (comps.find(c => c.types?.includes('street_number')) || {}).long_name;
            const txt = route ? (num ? `${route}, ${num}` : route) : (r.formatted_address || query);
            return { latitude: loc.lat, longitude: loc.lng, address: normalizeAddr(txt) };
          }
        }
      } catch(_) {}
    }

    // 3) LocationIQ search
    if (liqKey) {
      try {
        // Ограничиваем страны через countrycodes=kg
        const url = `https://us1.locationiq.com/v1/search?format=json&q=${q}&addressdetails=1&accept-language=ru&countrycodes=kg&key=${liqKey}`;
        const arr = await fetchJSON(url);
        if (Array.isArray(arr) && arr.length) {
          const r = arr[0];
          const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
          if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
            const a = r?.address || {};
            const street = a.road || a.pedestrian || a.residential || a.footway || a.path || a.cycleway || a.highway;
            const house = a.house_number || a.building || a.house;
            const txt = street ? (house ? `${street}, ${house}` : street) : (r.display_name || query);
            return { latitude: lat, longitude: lon, address: normalizeAddr(txt) };
          }
        }
      } catch(_) {}
    }

    // 4) Nominatim search (OSM)
    try {
      // Ограничиваем страны через countrycodes=kg
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&addressdetails=1&accept-language=ru&countrycodes=kg&limit=5`;
      const arr = await fetchJSON(url);
      if (Array.isArray(arr) && arr.length) {
        const r = arr[0];
        const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
          const a = r?.address || {};
          const street = a.road || a.pedestrian || a.residential || a.footway || a.path || a.cycleway || a.highway;
          const house = a.house_number || a.building || a.house;
          const txt = street ? (house ? `${street}, ${house}` : street) : (r.display_name || query);
          return { latitude: lat, longitude: lon, address: normalizeAddr(txt) };
        }
      }
    } catch(_) {}

    return null;
  }, [fetchJSON, normalizeAddr, isInKG]);

  // Дебаунс подсказок при вводе в A/B
  useEffect(() => {
    const q = activeField === 'A' ? addrA : activeField === 'B' ? addrB : null;
    if (!activeField) return;
    if (suggestTimerRef.current) { clearTimeout(suggestTimerRef.current); suggestTimerRef.current = null; }
    if (!q || q.trim().length < 2) { setSuggestions([]); setSuggesting(false); return; }
    setSuggesting(true);
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const list = await suggestPlaces(q);
        setSuggestions(list);
      } catch (_) {
        setSuggestions([]);
      } finally {
        setSuggesting(false);
      }
    }, 300);
    return () => {
      if (suggestTimerRef.current) { clearTimeout(suggestTimerRef.current); suggestTimerRef.current = null; }
    };
  }, [activeField, addrA, addrB, suggestPlaces]);

  // Когда клавиатура закрывается, делаем поле неактивным и скрываем подсказки
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      try {
        if (activeField === 'A' && addrARef.current?.isFocused?.()) addrARef.current.blur();
        if (activeField === 'B' && addrBRef.current?.isFocused?.()) addrBRef.current.blur();
      } catch (_) {}
      setActiveField(null);
      setSuggestions([]);
    });
    return () => { sub.remove(); };
  }, [activeField]);

  // Дополнительное уточнение номера дома через Overpass (больший радиус)
  const refineHouseNumber = useCallback(async (lat, lon, baseStreet) => {
    try {
      const q = `
        [out:json][timeout:8];
        (
          way(around:220,${lat},${lon})["addr:housenumber"];
          node(around:220,${lat},${lon})["addr:housenumber"];
        );
        out body center;
      `;
      const j = await overpassQuery(q);
      if (j && Array.isArray(j.elements) && j.elements.length) {
        let best = null, bestD = Infinity;
        j.elements.forEach(el => {
          const elLat = el.lat || (el.center && el.center.lat);
          const elLon = el.lon || (el.center && el.center.lon);
          if (elLat != null && elLon != null) {
            const d = distMeters({ lat, lon }, { lat: elLat, lon: elLon });
            if (d < bestD) { bestD = d; best = el; }
          }
        });
        if (best && best.tags) {
          const h = best.tags["addr:housenumber"]; const st = best.tags["addr:street"] || baseStreet || null;
          if (st && h) return normalizeAddr(`${st}, ${h}`);
        }
      }
    } catch (_) {}
    return null;
  }, [distMeters, normalizeAddr, overpassQuery]);

  // Улучшенное обратное геокодирование: OSRM nearest -> Nominatim -> Overpass (fallback для номера дома)
  const reverseAddressBest = useCallback(async (lat, lon) => {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    const cached = geocodeCacheRef.current.get(key);
    if (cached) return cached;
  const yaKey = Constants?.expoConfig?.extra?.yandex?.apiKey;
  const gKey = Constants?.expoConfig?.extra?.googleMapsApiKey;
  const dgisKey = Constants?.expoConfig?.extra?.dgisApiKey;
  const liqKey = Constants?.expoConfig?.extra?.locationIqKey;

    // 0) Yandex Geocoder (если есть ключ) — максимально близко к данным карты
  if (yaKey) {
      try {
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${yaKey}&format=json&geocode=${lon},${lat}&lang=ru_RU&kind=house&results=1`;
  const j = await fetchJSON(url);
        const fm = j?.response?.GeoObjectCollection?.featureMember;
        if (Array.isArray(fm) && fm.length) {
          const geo = fm[0]?.GeoObject;
          const md = geo?.metaDataProperty?.GeocoderMetaData;
          const comps = md?.Address?.Components || [];
          const districtComp = comps.find(c => c.kind === 'district' || c.kind === 'area' || c.kind === 'province');
          const district = districtComp && districtComp.name ? districtComp.name : null;
          const street = (comps.find(c => c.kind === 'street' || c.kind === 'thoroughfare') || {}).name;
      const houseComp = (comps.find(c => c.kind === 'house') || {});
      const house = houseComp.name || houseComp.number || null;
          const formatted = md?.Address?.formatted || md?.text || null;
          let txt = null;
          if (street && house) txt = `${district ? district + ', ' : ''}${street}, ${house}`;
          else if (street) txt = `${district ? district + ', ' : ''}${street}`;
          else if (formatted) txt = formatted;
          if (txt) {
            const res = normalizeAddr(txt);
            geocodeCacheRef.current.set(key, res);
            return res;
          }
        }
      } catch (_) { /* fallthrough */ }
    }

    // 1) 2GIS координатный геокодер (бесплатно, хороший охват RU/KG)
  if (dgisKey) {
      try {
        const url = `https://catalog.api.2gis.com/3.0/items/geocode?lat=${lat}&lon=${lon}&type=house&key=${dgisKey}`;
  const j = await fetchJSON(url);
        const items = j?.result?.items || [];
        if (items.length) {
          // Берём первый адресный объект; собираем улицу и номер
          const it = items[0];
      const address = it?.address_name || it?.full_name || null;
    if (address) { const res = normalizeAddr(address); geocodeCacheRef.current.set(key, res); return res; }
        }
      } catch (_) { /* fallthrough */ }
    }
    // 2) Google (если доступен) — даёт стабильные номера домов
  if (gKey) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&language=ru&key=${gKey}`;
  const j = await fetchJSON(url);
        if (j && Array.isArray(j.results) && j.results.length) {
          // Ищем типы street_address / premise / subpremise, затем route+street_number
          const pick = j.results.find(it => it.types && (it.types.includes('street_address') || it.types.includes('premise'))) || j.results[0];
          const comps = (pick && pick.address_components) || [];
          const route = (comps.find(c => c.types.includes('route')) || {}).long_name;
          const num = (comps.find(c => c.types.includes('street_number')) || {}).long_name;
      const txt = route ? (num ? `${route}, ${num}` : route) : (pick.formatted_address || null);
    if (txt) { const res = normalizeAddr(txt); geocodeCacheRef.current.set(key, res); return res; }
        }
      } catch (_) { /* fallthrough to OSM path */ }
    }

  // 3) LocationIQ (бесплатный тариф с ключом)
  if (liqKey) {
      try {
        const url = `https://us1.locationiq.com/v1/reverse?format=json&lat=${lat}&lon=${lon}&normalizecity=1&addressdetails=1&accept-language=ru&key=${liqKey}`;
        const j = await fetchJSON(url);
        const a = j?.address || {};
        const street = a.road || a.pedestrian || a.residential || a.footway || a.path || a.cycleway || a.highway;
        const house = a.house_number || a.building || a.house;
  if (street && house) { const res = normalizeAddr(`${street}, ${house}`); geocodeCacheRef.current.set(key, res); return res; }
  if (street) { const res = normalizeAddr(street); geocodeCacheRef.current.set(key, res); return res; }
    const dn = j?.display_name || null;
  if (dn) { const res = normalizeAddr(dn); geocodeCacheRef.current.set(key, res); return res; }
      } catch (_) { /* continue */ }
    }
    let sLat = lat, sLon = lon;
    // Снап к ближайшей дороге, чтобы Nominatim чаще давал улицу/дом
    try {
  const nj = await fetchJSON(`https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}`);
      const wp = nj && nj.waypoints && nj.waypoints[0] && nj.waypoints[0].location;
      if (Array.isArray(wp)) { sLon = wp[0]; sLat = wp[1]; }
    } catch (_) {}

    let street = null, house = null, fallbackText = null, districtOSM = null;
    try {
  const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${sLat}&lon=${sLon}&accept-language=ru&addressdetails=1&zoom=18`);
      const a = j?.address || {};
      street = a.road || a.pedestrian || a.footway || a.path || a.cycleway || a.residential || a.highway || null;
      house = a.house_number || a.building || a.house || null;
      districtOSM = a.suburb || a.neighbourhood || a.city_district || a.district || null;
      fallbackText = j?.name || j?.display_name || null;
    } catch (_) {}

  if (street && house) { const res = normalizeAddr(`${districtOSM ? districtOSM + ', ' : ''}${street}, ${house}`); geocodeCacheRef.current.set(key, res); return res; }

    // Найти ближайший дом с номером через Overpass, если улица есть, а дома нет
    if (street && !house) {
      try {
        const q = `
          [out:json][timeout:8];
          (
            way(around:220,${lat},${lon})["addr:housenumber"]; 
            node(around:220,${lat},${lon})["addr:housenumber"]; 
          );
          out body center;
        `;
        const oj = await overpassQuery(q);
        if (oj && Array.isArray(oj.elements) && oj.elements.length) {
          let best = null, bestD = Infinity;
          oj.elements.forEach(el => {
            const elLat = el.lat || (el.center && el.center.lat);
            const elLon = el.lon || (el.center && el.center.lon);
            if (elLat != null && elLon != null) {
              const d = distMeters({ lat, lon }, { lat: elLat, lon: elLon });
              if (d < bestD) { bestD = d; best = el; }
            }
          });
          if (best && best.tags) {
            const h = best.tags["addr:housenumber"];
            const st = best.tags["addr:street"] || street;
            if (st && h) { const res = normalizeAddr(`${st}, ${h}`); geocodeCacheRef.current.set(key, res); return res; }
          }
        }
      } catch (_) {}
    }

    // Если улицы нет — попробуем найти объект с addr:street + addr:housenumber поблизости
    if (!street) {
      try {
        const q2 = `
          [out:json][timeout:8];
          (
            way(around:200,${lat},${lon})["addr:street"]["addr:housenumber"]; 
            node(around:200,${lat},${lon})["addr:street"]["addr:housenumber"]; 
          );
          out body center;
        `;
        const oj2 = await overpassQuery(q2);
        if (oj2 && Array.isArray(oj2.elements) && oj2.elements.length) {
          let best = null, bestD = Infinity;
          oj2.elements.forEach(el => {
            const elLat = el.lat || (el.center && el.center.lat);
            const elLon = el.lon || (el.center && el.center.lon);
            if (elLat != null && elLon != null) {
              const d = distMeters({ lat, lon }, { lat: elLat, lon: elLon });
              if (d < bestD) { bestD = d; best = el; }
            }
          });
          if (best && best.tags) {
            const st = best.tags["addr:street"]; const h = best.tags["addr:housenumber"]; 
            if (st && h) { const res = normalizeAddr(`${st}, ${h}`); geocodeCacheRef.current.set(key, res); return res; }
          }
        }
      } catch (_) {}
    }

  if (street) { const res = normalizeAddr(`${districtOSM ? districtOSM + ', ' : ''}${street}`); geocodeCacheRef.current.set(key, res); return res; }
  if (fallbackText) { const res = normalizeAddr(fallbackText); geocodeCacheRef.current.set(key, res); return res; }

  // 4) Expo device reverse geocoder as last resort
  try {
    const arr = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (Array.isArray(arr) && arr.length) {
      const it = arr[0] || {};
      const street2 = it.street || it.name || null;
      const house2 = it.streetNumber || it.name || null;
      if (street2 && house2) { const res = normalizeAddr(`${street2}, ${house2}`); geocodeCacheRef.current.set(key, res); return res; }
      if (street2) { const res = normalizeAddr(street2); geocodeCacheRef.current.set(key, res); return res; }
    }
  } catch (_) {}
  // Не кэшируем неуспех, чтобы была возможность повторной попытки
  return null;
  }, [distMeters, normalizeAddr, overpassQuery, fetchJSON]);

  // ...

  // Стабильные колбэки для карты (не меняются между рендерами)
  const onMapReady = useCallback(() => {}, []);
  const onMapClickCb = useCallback((p) => {
    const { latitude, longitude } = p;
    setRouteInfo(null);
    Keyboard.dismiss();
    // Если активно поле A — выбор точки по карте заполняет A и ставит старт
    if (activeField === 'A') {
      // Быстрая подстановка и центрирование
      if (p.address && typeof p.address === 'string') {
        try { setAddrA(normalizeAddr(p.address)); } catch(_) {}
      } else {
        setAddrA('');
      }
      setRegion({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      setStartPoint({ latitude, longitude });
      setStartIsManual(true);
      startIsManualRef.current = true;
  setStartVisible(true);
      setActiveField(null);
      setSuggestions([]);
      // Асинхронно уточняем адрес и номер дома
      (async () => {
        try {
          let addr = p.address ? normalizeAddr(p.address) : await reverseAddressBest(latitude, longitude);
          if (addr && !hasHouseNumber(addr)) {
            const baseSt = extractBaseStreet(addr);
            const refined = await refineHouseNumber(latitude, longitude, baseSt);
            if (refined) addr = refined;
          }
          if (!addr) {
            try {
              const nj = await fetchJSON(`https://router.project-osrm.org/nearest/v1/driving/${longitude},${latitude}`);
              const name = nj?.waypoints?.[0]?.name;
              if (name && typeof name === 'string' && name.length > 0) addr = name;
            } catch(_) {}
          }
          setAddrA(addr || null);
        } catch(_) {}
      })();
      return;
    }

    // Иначе — это выбор точки B как и раньше
    const initial = { latitude, longitude };
    if (p.address) initial.address = normalizeAddr(p.address);
    setPending(initial);
    if (p.address && typeof p.address === 'string') {
      try { setAddrB(normalizeAddr(p.address)); } catch(_) {}
    } else {
      setAddrB('');
    }
    setActiveField(null);
    setSuggestions([]);
    (async () => {
      try {
        if (p.address) {
          let addr = normalizeAddr(p.address);
          if (addr && !hasHouseNumber(addr)) {
            const baseSt = extractBaseStreet(addr);
            const refined = await refineHouseNumber(latitude, longitude, baseSt);
            if (refined) addr = refined;
          }
          setPending(prev => (prev ? { ...prev, address: addr || prev?.address || null } : null));
          setAddrB(addr || null);
        } else {
          let addr = await reverseAddressBest(latitude, longitude);
          if (addr && !hasHouseNumber(addr)) {
            const baseSt = extractBaseStreet(addr);
            const refined = await refineHouseNumber(latitude, longitude, baseSt);
            if (refined) addr = refined;
          }
          if (!addr) {
            try {
              const nj = await fetchJSON(`https://router.project-osrm.org/nearest/v1/driving/${longitude},${latitude}`);
              const name = nj?.waypoints?.[0]?.name;
              if (name && typeof name === 'string' && name.length > 0) addr = name;
            } catch(_) {}
          }
          setPending(prev => prev ? { ...prev, address: addr || null } : null);
          setAddrB(addr || null);
        }
      } catch(_) {}
    })();
  }, [activeField, reverseAddressBest, normalizeAddr, hasHouseNumber, refineHouseNumber, extractBaseStreet, fetchJSON]);
  const onRouteCb = useCallback((info) => { setRouteInfo(info); setIsBuilding(false); }, []);
  const onErrorCb = useCallback(() => { setError('Не удалось отрисовать карту'); setIsBuilding(false); }, []);

  // Кнопка заказа эвакуатора: сохраняет заявку в локальную историю и на сервер
  const placeOrder = useCallback(async () => {
    try {
      let aText = addrA;
      let bText = addrB;
      if (!aText && startPoint) aText = `${startPoint.latitude?.toFixed?.(5)}, ${startPoint.longitude?.toFixed?.(5)}`;
      if (!bText) {
        if (pending?.address) bText = pending.address;
        else if (destination && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)) {
          try { bText = await reverseAddressBest(destination.latitude, destination.longitude); } catch(_) {}
          if (!bText) bText = `${destination.latitude?.toFixed?.(5)}, ${destination.longitude?.toFixed?.(5)}`;
        }
      }
      aText = (aText || '').trim();
      bText = (bText || '').trim();
      if (!aText) {
        Alert.alert('Не указан адрес A', 'Заполните точку A (Откуда).');
        return;
      }
      if (!bText) {
        Alert.alert('Не указан адрес B', 'Заполните точку B (Куда) или выберите место на карте.');
        return;
      }
      const locationLine = `A: ${aText} → B: ${bText}`;
      const key = 'tow_requests';
      const existing = await AsyncStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      // Расчёт стоимости по тарифу из базы: base + perKm * км (округление вверх) + per3min * блоки по 3 минуты (округление вверх)
      const calcCost = () => {
        const base = Number(tariff?.base ?? 0);
        const perKm = Number(tariff?.perKm ?? 0);
        const per3min = Number(tariff?.per3min ?? 0);
        const m = Number(routeInfo?.distance ?? 0);
        const s = Number(routeInfo?.duration ?? 0);
        if (!Number.isFinite(m) || !Number.isFinite(s)) return base;
        const kmBlocks = Math.ceil(m / 1000);
        const timeBlocks = Math.ceil(s / (3 * 60));
        return base + perKm * kmBlocks + per3min * timeBlocks;
      };
      const routeDistance = Number.isFinite(routeInfo?.distance) ? Number(routeInfo.distance) : null;
      const routeDuration = Number.isFinite(routeInfo?.duration) ? Number(routeInfo.duration) : null;
      const payload = {
        id: Date.now().toString(),
        location: locationLine,
        fromAddress: aText,
        toAddress: bText,
        startCoords: startPoint || null,
        destCoords: destination || pending || null,
  routeDistance,
  routeDuration,
  distanceKm: routeDistance != null ? Math.ceil(routeDistance / 1000) : null,
  finalCost: calcCost(),
  cost: undefined,
        startedAt: null,
        arrivedAt: null,
        driverName: null,
        vehicleMake: null,
        vehicleModel: null,
        plateNumber: null,
        vehicleColor: null,
        notes: '',
        createdAt: new Date().toISOString(),
      };
      // Persist to backend (single POST); store server response locally or fallback
      try {
        let serverOrder = null;
        try {
          const apiBase = getApiBase();
          const token = await AsyncStorage.getItem('tow_token');
          const resp = await fetch(apiBase + '/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
            body: JSON.stringify({
              address: locationLine,
              fromAddress: payload.fromAddress,
              toAddress: payload.toAddress,
              startCoords: payload.startCoords,
              destCoords: payload.destCoords,
              distance: routeDistance,
              duration: routeDuration,
              cost: payload.finalCost,
              meta: {
                distanceKm: null,
                createdAtIso: payload.createdAt,
              },
              details: {
                driverName: payload.driverName,
                vehicleMake: payload.vehicleMake,
                vehicleModel: payload.vehicleModel,
                plateNumber: payload.plateNumber,
                vehicleColor: payload.vehicleColor,
                notes: payload.notes,
                startedAt: payload.startedAt,
                arrivedAt: payload.arrivedAt,
              }
            })
          });
          if (resp.ok) { serverOrder = await resp.json(); }
        } catch(_) {}
  // Ensure local fallback also has a cost field
  if (payload.cost === undefined) payload.cost = payload.finalCost;
  const toStore = serverOrder || payload;
        const next = [toStore, ...list];
        await AsyncStorage.setItem(key, JSON.stringify(next));
        Alert.alert('Заявка создана', serverOrder ? 'Заявка сохранена.' : 'Заявка сохранена локально. Сервер недоступен.');
      } catch (_) {
        Alert.alert('Заявка создана', 'Заявка сохранена локально.');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось создать заявку.');
    }
  }, [addrA, addrB, pending, destination, startPoint, reverseAddressBest, routeInfo, tariff, getApiBase]);

  // Обработчик кнопки заказа: если нет токена — открыть форму входа
  const onPlaceOrderPress = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('tow_token');
      if (!token) {
        try { await AsyncStorage.setItem('tow_wants_order', '1'); } catch {}
        try { const { navigate } = require('../navigation/navigationRef'); navigate('Вход'); } catch {
          // fallback: old modal if navigation fails
          setAuthOpen(true);
          setAuthStep(1);
          setAuthPhone(''); setAuthCode(''); setAuthName(''); setAuthDevHint(''); setAuthMode('login');
        }
        return;
      }
      await placeOrder();
    } catch (_) {
      await placeOrder();
    }
  }, [placeOrder]);

  // После успешного входа автоматически продолжим заказ один раз
  useEffect(() => {
    const off = onEvent('auth:changed', async (payload) => {
      if (payload && payload.action === 'login') {
        try {
          const flag = await AsyncStorage.getItem('tow_wants_order');
          if (flag === '1') {
            await AsyncStorage.removeItem('tow_wants_order');
            await placeOrder();
          }
        } catch {}
      }
    });
    return () => { try { off && off(); } catch {} };
  }, [placeOrder]);

  const startLocationFlow = async () => {
    try {
      setLoading(true);
      setError(null);

      const last = await Location.getLastKnownPositionAsync();
      let latitude = last?.coords?.latitude;
      let longitude = last?.coords?.longitude;

      // Если есть lastKnown — сразу показываем его на карте и проставляем адрес A (быстрая префил)
      if (latitude != null && longitude != null) {
        const initialRegionQuick = {
          latitude,
          longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
  setUserCoords({ latitude, longitude });
  if (!startIsManualRef.current) setStartPoint({ latitude, longitude });
        setRegion(initialRegionQuick);
        (async () => {
          try {
            let addrQuick = await reverseAddressBest(latitude, longitude);
            if (addrQuick && !hasHouseNumber(addrQuick)) {
              const ai = addrQuick.split(',').map(s=>s.trim());
              const st = ai[0] || null;
              const refined = await refineHouseNumber(latitude, longitude, st);
              if (refined) addrQuick = refined;
            }
            if (!startIsManualRef.current) setAddrA(addrQuick || null);
          } catch (_) {}
        })();
      }

      // Пытаемся получить текущее с таймаутом, чтобы не зависать
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 5000,
          maximumAge: 5000,
        });
        if (loc?.coords) {
          latitude = loc.coords.latitude;
          longitude = loc.coords.longitude;
        }
      } catch (_) {
        // Если не удалось быстро — используем lastKnown, если он был
      }

      if (latitude == null || longitude == null) {
        throw new Error('no-location');
      }

      // Обновляем координаты/регион и адрес A по более точной текущей позиции
      const initialRegion = {
        latitude,
        longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
  setUserCoords({ latitude, longitude });
  if (!startIsManualRef.current) setStartPoint({ latitude, longitude });
      setRegion(initialRegion);
      (async () => {
        try {
          let addr = await reverseAddressBest(latitude, longitude);
          if (addr && !hasHouseNumber(addr)) {
            const ai = addr.split(',').map(s=>s.trim());
            const st = ai[0] || null;
            const refined = await refineHouseNumber(latitude, longitude, st);
            if (refined) addr = refined;
          }
          if (!startIsManualRef.current) setAddrA(addr || null);
        } catch (_) {}
      })();

      // Подписка на обновления (без агрессивной частоты)
      try {
    watchRef.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (update) => {
            const { latitude: lat, longitude: lng } = update.coords;
      setUserCoords({ latitude: lat, longitude: lng });
            if (!startIsManualRef.current) setStartPoint({ latitude: lat, longitude: lng });
            (async () => {
              try {
                let addr = await reverseAddressBest(lat, lng);
                if (addr && !hasHouseNumber(addr)) {
                  const ai = addr.split(',').map(s=>s.trim());
                  const st = ai[0] || null;
                  const refined = await refineHouseNumber(lat, lng, st);
                  if (refined) addr = refined;
                }
                if (!startIsManualRef.current) setAddrA(addr || null);
              } catch (_) {}
            })();
          }
        );
      } catch (_) {
        // ignore
      }
    } catch (e) {
  setError('Не удалось получить местоположение');
    } finally {
      setLoading(false);
    }
  };

  // При монтировании: проверяем текущее разрешение
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        setCanAskAgain(current.canAskAgain ?? true);
        if (current.status === 'granted') {
          setPermissionStatus('granted');
          startLocationFlow();
        } else {
          setPermissionStatus('prompt');
          setLoading(false);
        }
      } catch (_) {
        if (!mounted) return;
        setPermissionStatus('prompt');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  const onRequestPermission = async () => {
    try {
      const req = await Location.requestForegroundPermissionsAsync();
      setCanAskAgain(req.canAskAgain ?? true);
      if (req.status === 'granted') {
        setPermissionStatus('granted');
        startLocationFlow();
      } else if (!req.canAskAgain) {
        Alert.alert(
          'Нужен доступ к геолокации',
          'Откройте настройки и разрешите доступ к местоположению.',
          [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Открыть настройки', onPress: () => Linking.openSettings && Linking.openSettings() },
          ]
        );
      }
    } catch (_) {
      // ignore
    }
  };

  return (
    <View style={styles.container}>
      {permissionStatus !== 'granted' ? (
        <View style={styles.center}>
          <Text style={{ marginBottom: 8 }}>
            {permissionStatus === 'checking' ? 'Проверяем доступ к геопозиции…' : 'Требуется доступ к геопозиции'}
          </Text>
          {permissionStatus === 'prompt' && (
            <TouchableOpacity onPress={onRequestPermission} style={styles.permissionBtn} activeOpacity={0.85}>
              <Text style={{ color: '#111', fontWeight: '600' }}>Разрешить</Text>
            </TouchableOpacity>
          )}
          {permissionStatus === 'prompt' && !canAskAgain && (
            <TouchableOpacity onPress={() => Linking.openSettings && Linking.openSettings()} style={{ marginTop: 8 }}>
              <Text style={{ color: '#0a84ff', fontWeight: '600' }}>Открыть настройки</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : region ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <MapViewProvider
            center={{ latitude: region.latitude, longitude: region.longitude }}
            zoom={15}
            destination={destination}
            preview={pending}
            start={startPoint || userCoords}
            startIsManual={startIsManual}
            startVisible={startVisible}
            userLocation={userCoords}
            recenterAt={recenterTick}
            recenterCoords={userCoords}
            resetAt={resetTick}
            clearDestinationAt={clearDestTick}
            clearRouteOnlyAt={clearRouteTick}
            apiKey={Constants?.expoConfig?.extra?.yandex?.apiKey || ''}
            onReady={onMapReady}
            onMapClick={onMapClickCb}
            onRoute={onRouteCb}
            onError={onErrorCb}
          />
          
        </View>
      ) : (
        <View style={styles.center}>
          {loading ? <Text>Определяем местоположение…</Text> : <Text>{error || 'Не удалось определить местоположение'}</Text>}
        </View>
      )}
  {/* coords badge removed per user request */}

    {/* Нижняя панель с двумя инпутами: A (текущее место, улица+дом) и B (назначение) */}
  <View style={styles.addrInputsWrap} pointerEvents="auto">
        {/* Информация о маршруте теперь внизу панели, над полями A и B */}
        {routeInfo && (
          <View style={styles.routeBadge}>
            <View style={{ flex: 1 }}>
              {/* {(addrA || addrB) && (
                <Text style={[styles.routeText, { marginBottom: 2 }]} numberOfLines={2}>
                  {addrA ? `A: ${addrA}` : ''}{addrA && addrB ? '  →  ' : ''}{addrB ? `B: ${addrB}` : ''}
                </Text>
              )} */}
              <Text style={styles.routeText}>
                Расстояние: <Text style={styles.routeTextValueKm}>{routeInfo.distanceText || `${Math.round((routeInfo.distance || 0) / 100) / 10} км`}</Text> , Время: <Text style={styles.routeTextValueTm}>{routeInfo.durationText || `${Math.round((routeInfo.duration || 0) / 60)} мин`}</Text>
              </Text>
              <Text style={[styles.routeText, { marginTop: 2 }]}>Стоимость: <Text style={styles.routeTextCash}>{(() => {
                const m = routeInfo?.distance || 0;
                const s = routeInfo?.duration || 0;
                const kmBlocks = Math.ceil(m / 1000);
                const timeBlocks = Math.ceil(s / (3 * 60));
                const base = Number(tariff?.base ?? 0);
                const perKm = Number(tariff?.perKm ?? 0);
                const per3min = Number(tariff?.per3min ?? 0);
                const cost = base + perKm * kmBlocks + per3min * timeBlocks;
                return `${cost} сом`;
              })()}</Text></Text>
            </View>
            {/* <TouchableOpacity onPress={() => {
              // Clear route and map state
              setDestination(null);
              setRouteInfo(null);
              setClearDestTick(t=>t+1);
              setResetTick(t=>t+1);
              // Also clear input fields A and B, and close suggestions/keyboard
              setAddrA('');
              setAddrB('');
              setSuggestions([]);
              setActiveField(null);
              try { if (addrARef.current?.isFocused?.()) addrARef.current.blur(); } catch(_) {}
              try { if (addrBRef.current?.isFocused?.()) addrBRef.current.blur(); } catch(_) {}
            }}>
              <Text style={styles.routeClear}>Сбросить</Text>
            </TouchableOpacity> */}
          </View>
        )}
        {/* Подсказки по вводу A/B с анимацией загрузки — теперь над полями */}
        {activeField && (suggesting || (suggestions && suggestions.length > 0)) && (
          <View style={styles.suggestWrap}>
            {suggesting && (
              <View style={styles.suggestLoader}>
                <ActivityIndicator size="small" color="#0a84ff" />
                <Text style={styles.suggestLoadingText}>Поиск…</Text>
              </View>
            )}
            {suggestions && suggestions.length > 0 && suggestions.map((sug, idx) => (
              <TouchableOpacity key={`${sug.title}-${idx}`} style={styles.suggestItem} activeOpacity={0.7}
                onPress={() => {
                  if (activeField === 'A') {
                    setAddrA(sug.address || sug.title);
                    if (Number.isFinite(sug.latitude) && Number.isFinite(sug.longitude)) {
                      // Центруем карту, не трогая координаты пользователя
                      setRegion({ latitude: sug.latitude, longitude: sug.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
                      // Устанавливаем ручной старт A
                      setStartPoint({ latitude: sug.latitude, longitude: sug.longitude });
                      setStartIsManual(true);
                      startIsManualRef.current = true;
                      setStartVisible(true);
                    }
                  } else if (activeField === 'B') {
                    setAddrB(sug.address || sug.title);
                    if (Number.isFinite(sug.latitude) && Number.isFinite(sug.longitude)) {
                      setPending({ latitude: sug.latitude, longitude: sug.longitude, address: sug.address || sug.title });
                    }
                  }
                  setSuggestions([]);
                  setActiveField(null);
                }}>
                <Text numberOfLines={1} style={styles.suggestTitle}>{sug.title}</Text>
                {!!sug.subtitle && <Text numberOfLines={1} style={styles.suggestSubtitle}>{sug.subtitle}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
  {/* Панель действий уровня инпутов: центр и сброс (скрыта) */}
  <View style={styles.toolsRow} />
  <View style={styles.addrRow} pointerEvents="auto">
          <TextInput
            ref={addrARef}
            style={styles.addrInput}
            placeholder="Откуда"
            value={addrA ?? ''}
    onFocus={() => setActiveField('A')}
    onBlur={() => setActiveField(null)}
  onChangeText={(t) => { setAddrA(t); setActiveField('A'); setLastUserEditAt(Date.now()); }}
            editable
            returnKeyType="search"
            onSubmitEditing={async () => {
              try {
                const res = await geocodeTextBest(addrA);
                if (res) {
                  // Перемещаем карту к выбранному месту (A), не переопределяя реальное местоположение пользователя
                  setRegion({ latitude: res.latitude, longitude: res.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
                  // Фиксируем точку A как старт маршрута (ручной старт)
                  setStartPoint({ latitude: res.latitude, longitude: res.longitude });
                  setStartIsManual(true);
                  startIsManualRef.current = true;
                  setStartVisible(true);
                  setAddrA(res.address || addrA);
      setSuggestions([]);
      setActiveField(null);
                }
              } catch(_) {}
            }}
          />
          
          <TouchableOpacity
            style={[styles.clearBtnRight]}
            activeOpacity={0.8}
            onPress={() => {
              setAddrA('');
              // Also clear manual start marker and unlock auto-start
              setStartIsManual(false);
              startIsManualRef.current = false;
              // Hide the A (start) marker entirely; user location marker remains visible
              setStartVisible(false);
              setStartPoint(null);
              // Clear only the built route polyline (keep destination marker B)
              setRouteInfo(null);
              setClearRouteTick(t=>t+1);
              setSuggestions([]);
              setActiveField(null);
            }}
          >
            <MaterialIcons name="close" size={20} color="#0a84ff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addrFillBtn}
            activeOpacity={0.85}
            onPress={async () => {
              try {
                if (!userCoords) { Alert.alert('Нет геопозиции', 'Местоположение ещё не определено.'); return; }
                let addr = await reverseAddressBest(userCoords.latitude, userCoords.longitude);
                if (addr && !hasHouseNumber(addr)) {
                  const ai = addr.split(',').map(s=>s.trim());
                  const st = ai[0] || null;
                  const refined = await refineHouseNumber(userCoords.latitude, userCoords.longitude, st);
                  if (refined) addr = refined;
                }
                setAddrA(addr || addrA || '');
                setStartPoint({ latitude: userCoords.latitude, longitude: userCoords.longitude });
                setStartIsManual(true);
                startIsManualRef.current = true;
                setStartVisible(true);
                setActiveField(null);
                setSuggestions([]);
              } catch(_) {}
            }}
          >
            
            <MaterialIcons name="location-on" size={22} color="#0a84ff" />
          </TouchableOpacity>
           <TouchableOpacity
            style={styles.toolBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (HomeScreen._lockRC) return; HomeScreen._lockRC = true; setTimeout(() => { HomeScreen._lockRC = false; }, 350);
              setRecenterTick(t => t + 1);
            }}
          >
            <MaterialIcons name="my-location" size={18} color="#0a84ff" />
          </TouchableOpacity>
        </View>
  <View style={[styles.addrRow, { marginTop: 8 }]} pointerEvents="auto">
          <TextInput
            ref={addrBRef}
            style={styles.addrInput}
            placeholder="Куда"
            value={addrB ?? (pending && pending.address ? normalizeAddr(pending.address) : '')}
            onFocus={() => setActiveField('B')}
            onBlur={() => setActiveField(null)}
            onChangeText={(t) => { setAddrB(t); setActiveField('B'); setLastUserEditAt(Date.now()); }}
            editable
            returnKeyType="search"
            onSubmitEditing={async () => {
              try {
                const res = await geocodeTextBest(addrB);
                if (res) {
                  // Заполняем pending и показываем подтверждение для B
                  setPending({ latitude: res.latitude, longitude: res.longitude, address: res.address });
                  setSuggestions([]);
                  setActiveField(null);
                }
              } catch(_) {}
            }}
          />
          <TouchableOpacity
            style={[styles.clearBtnRight]}
            activeOpacity={0.8}
            onPress={() => {
              setAddrB('');
              setPending(null);
              // Also clear destination marker and route polyline
              setDestination(null);
              setRouteInfo(null);
              setClearDestTick(t=>t+1);
              setResetTick(t=>t+1);
              setSuggestions([]);
              setActiveField(null);
            }}
          >
            <MaterialIcons name="close" size={20} color="#0a84ff" />
          </TouchableOpacity>
          {(() => {
            const aNow = norm(addrA);
            const bNow = norm(addrB);
            const builtA = norm(lastBuilt?.a);
            const builtB = norm(lastBuilt?.b);
            const inputsSame = !!routeInfo && aNow === builtA && bNow === builtB;
            const buildLocked = !!routeInfo && inputsSame && lastBuildAt && (!lastUserEditAt || lastUserEditAt <= lastBuildAt);
            return (
          <TouchableOpacity
            style={[
              styles.routeBtn,
              (isBuilding || buildLocked) ? { opacity: 0.5 } : null
            ]}
            activeOpacity={0.9}
            disabled={isBuilding || buildLocked}
            onPress={async () => {
              try {
                setIsBuilding(true);
                // Require both fields A and B to be non-empty before building a route
                const aText = (addrA || '').trim();
                const bText = (addrB || '').trim();
                if (!aText || !bText) {
                  Alert.alert('Недостаточно данных', 'Заполните адреса A и B перед построением маршрута.');
                  setIsBuilding(false);
                  return;
                }
                if (pending && Number.isFinite(pending.latitude) && Number.isFinite(pending.longitude)) {
                  // Подтверждаем маршрут до pending так же, как по кнопке "Да"
                  let builtBText = bText;
                  try {
                    let tmp = pending.address ? normalizeAddr(pending.address) : await reverseAddressBest(pending.latitude, pending.longitude);
                    if (tmp && !hasHouseNumber(tmp)) {
                      const baseSt = extractBaseStreet(tmp);
                      const refined = await refineHouseNumber(pending.latitude, pending.longitude, baseSt);
                      if (refined) tmp = refined;
                    }
                    builtBText = tmp || bText || '';
                    setAddrB(builtBText || null);
                  } catch (e) { setAddrB(null); }
                  setDestination({ latitude: pending.latitude, longitude: pending.longitude });
                  setPending(null);
                  setActiveField(null);
                  setSuggestions([]);
                  setLastBuilt({ a: norm(aText), b: norm(builtBText) });
                  setLastBuildAt(Date.now());
                  return;
                }
                const raw = (addrB || '').trim();
                if (!raw) {
                  Alert.alert('Точка B не задана', 'Введите адрес назначения или выберите точку на карте.');
                  setIsBuilding(false);
                  return;
                }
                const res = await geocodeTextBest(raw);
                if (res && Number.isFinite(res.latitude) && Number.isFinite(res.longitude)) {
                  setAddrB(res.address || raw);
                  setDestination({ latitude: res.latitude, longitude: res.longitude });
                  setPending(null);
                  setActiveField(null);
                  setSuggestions([]);
                  setLastBuilt({ a: norm(aText), b: norm(res.address || raw) });
                  setLastBuildAt(Date.now());
                } else {
                  // Nothing resolved
                  setIsBuilding(false);
                }
              } catch(_) {}
            }}
          >
            <Text style={styles.routeBtnText}>построить маршрут</Text>
          </TouchableOpacity>
            );
          })()}
          
        </View>
        {/* Кнопка заказа эвакуатора: активна только после построения маршрута */}
        <TouchableOpacity
          style={[
            styles.orderBtn,
            (!routeInfo || !Number.isFinite(routeInfo?.distance) || !Number.isFinite(routeInfo?.duration) || isBuilding) ? { opacity: 0.5 } : null
          ]}
          activeOpacity={0.9}
          onPress={onPlaceOrderPress}
          disabled={!routeInfo || !Number.isFinite(routeInfo?.distance) || !Number.isFinite(routeInfo?.duration) || isBuilding}
        >
          <Text style={styles.orderBtnText}>Заказать</Text>
        </TouchableOpacity>
      </View>

      {/* Окно входа/регистрации поверх всего */}
      <Modal visible={authOpen} transparent animationType="fade" onRequestClose={() => setAuthOpen(false)}>
        <View style={styles.authOverlay} pointerEvents="auto">
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>{authStep === 1 ? 'Вход по телефону' : (authMode === 'register' ? 'Регистрация' : 'Подтвердите вход')}</Text>
            {authStep === 1 ? (
              <>
                <TextInput
                  style={styles.authInput}
                  placeholder="Номер телефона"
                  keyboardType="phone-pad"
                  value={authPhone}
                  onChangeText={setAuthPhone}
                />
                <TouchableOpacity style={styles.authBtn} activeOpacity={0.85} onPress={authRequestCode} disabled={authLoading}>
                  <Text style={styles.authBtnText}>{authLoading ? 'Отправка…' : 'Получить код'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.authCancel} onPress={() => setAuthOpen(false)}>
                  <Text style={{ color: '#888' }}>Отмена</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.authInput}
                  placeholder="Код из SMS"
                  keyboardType="number-pad"
                  value={authCode}
                  onChangeText={setAuthCode}
                />
                {authMode === 'register' && (
                  <TextInput
                    style={styles.authInput}
                    placeholder="Ваше имя"
                    value={authName}
                    onChangeText={setAuthName}
                  />
                )}
                {!!authDevHint && <Text style={{ color: '#888', marginBottom: 8 }}>{authDevHint}</Text>}
                <TouchableOpacity style={styles.authBtn} activeOpacity={0.85} onPress={authVerify} disabled={authLoading}>
                  <Text style={styles.authBtnText}>{authLoading ? 'Проверка…' : (authMode === 'register' ? 'Зарегистрироваться' : 'Войти')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.authCancel} onPress={() => setAuthStep(1)}>
                  <Text style={{ color: '#888' }}>Назад</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

  {/* Кнопка заявки удалена: теперь выбор точки на карте и подтверждение формирует заявку. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,1)',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    elevation: 3,
    zIndex: 10,
  },
  ctaButton: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f7d307',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    color: '#ffffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  myLocationBtn: {
    width: 46,
    height: 46,
    backgroundColor: '#fff',
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
    bottom: 400,
  },
  myLocationText: { 
    fontSize: 20, 
    color: '#111',
  },
  detectBtn: {
    position: 'absolute',
    left: 16,
    bottom: 110,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  detectText: { color: '#111', fontWeight: '700' },
  routeBadge: {
    marginBottom: 8,
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
    routeText: { 
      color: '#717171ff', 
      fontWeight: '400',
      paddingTop: 5

    },
    routeTextValueKm: {
      color: '#6c6c6cff',
      fontWeight: '900',
    },
    routeTextValueTm: {
      color: '#6c6c6cff',
      fontWeight: '900',
    },
    routeTextCash: {
      color: '#00bbffff',
      fontWeight: '900',
    },
    routeClear: { 
      color: '#ff330aff', 
      fontWeight: '600',

    },
    // coords badge styles removed
    myLocationWrap: {
    position: 'absolute',
    right: 15,
    bottom: 120,
    zIndex: 1000,
    elevation: 12,
  },
    confirmBar: {
    position: 'absolute',
    bottom: 160,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 12,
    padding: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmText: { color: '#111', fontWeight: '600' },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
  addrInputsWrap: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1200,
  padding: 16,
  paddingTop: 5,
  boxSizing: 'border-box',
  borderColor: '#e9e9e9ff',
  backgroundColor: '#ffffffff',
  elevation: 6,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolBtn: {
    paddingHorizontal: 10,
    width: 44,
    height: 44,
    borderRadius: 30,
    backgroundColor: '#f2f6ff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cfe3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnText: { color: '#0a84ff', fontWeight: '700', marginLeft: 6 },
  addrLabel: {
    width: 28,
    height: 44,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: '#0a84ff',
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    marginRight: 0,
  },
  addrInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderTopLeftRadius: 30,
    borderBottomLeftRadius: 30,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRightColor: '#ddd',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    color: '#111',
    shadowColor: '#979696ff',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    fontSize: 17,
  },
  clearBtnRight: {
    width: 30,
    height: 44,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#979696ff',
    elevation: 2,
  },
  addrFillBtn: {
    marginLeft: 8,
    marginRight: 4,
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 30,
    backgroundColor: '#f2f6ff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cfe3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrFillBtnText: { color: '#0a84ff', fontWeight: '700' },
  suggestWrap: {
  marginBottom: 8,
    maxHeight: 220,
    borderRadius: 10,
    backgroundColor: 'red',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  suggestItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  suggestLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  suggestLoadingText: { marginLeft: 8, color: '#333' },
  suggestTitle: { color: '#111', fontWeight: '700' },
  suggestSubtitle: { color: '#555', marginTop: 2 },
  routeBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 30,
    borderColor: '#ddd',
    // borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#389cffff',
    shadowColor: '#979696ff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  routeBtnText: { color: '#ffffffff', fontWeight: '500', width: 66, textAlign: 'center' },
  orderBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 30,
    backgroundColor: '#389cffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#979696ff',
    elevation: 2,
  },
  orderBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  // Авторизация
  authOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  authCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 4 },
  authTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  authInput: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 10 },
  authBtn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  authBtnText: { color: '#fff', fontWeight: '700' },
  authCancel: { marginTop: 10, alignItems: 'center' },

});
