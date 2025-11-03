import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, TextInput, ActivityIndicator, Keyboard, Modal, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import MapViewProvider from './MapViewProvider';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { on as onEvent, emit as emitEvent } from '../utils/eventBus';
import { requestCode as requestAuthCode, verifyAuth as verifyAuthApi, normalizeKgPhone } from '../utils/auth';
import { useFocusEffect } from '@react-navigation/native';

// Карта показывается только после получения геопозиции пользователя
export default function HomeScreen({ navigation }) {
  const watchRef = useRef(null);
  const geocodeCacheRef = useRef(new Map());
  const suggestCacheRef = useRef(new Map()); // Кэш для подсказок - экономия API запросов
  const geocodeTextCacheRef = useRef(new Map()); // Кэш для прямого геокодинга - экономия API запросов
  const extraRef = useRef(Constants?.expoConfig?.extra || Constants?.manifest?.extra || {});
  const extra = extraRef.current;
  
  // Анимация для кнопки меню
  const menuScaleAnim = useRef(new Animated.Value(1)).current;
  const menuModalScale = useRef(new Animated.Value(0)).current;
  const [menuVisible, setMenuVisible] = useState(false);

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

  // Базовая очистка адресных строк
  const normalizeAddr = useCallback((addr) => {
    if (!addr) return null;
    const cleaned = String(addr).trim().replace(/\s+/g, ' ');
    return cleaned || null;
  }, []);

  // Проверка на Plus Code (Open Location Code)
  const isPlusCode = useCallback((str) => {
    if (!str || typeof str !== 'string') return false;
    // Plus Code pattern: XXXX+XX или длиннее
    return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(str.replace(/\s/g, ''));
  }, []);

  // Форматирование координат для отображения
  const formatCoords = useCallback((lat, lon) => {
    return `Координаты: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
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

  const hasHouseNumber = useCallback((addr) => {
    if (!addr) return false;
    const text = String(addr);
    return /\b\d+[а-яa-z]?([\\/\-]\d+[а-яa-z]?)?\b/i.test(text);
  }, []);

  const extractBaseStreet = useCallback((addr) => {
    const normalized = normalizeAddr(addr);
    if (!normalized) return null;
    const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    if (/^\d/.test(first) && parts.length > 1) return parts[1];
    return first;
  }, [normalizeAddr]);

  // Оценка, что адрес низкого качества (только район/страна и т.п.)
  const isRegionLevelAddr = useCallback((addr) => {
    if (!addr || typeof addr !== 'string') return false;
    const s = addr.toLowerCase();
    // Если в строке есть слова типа район/область/страна или явно указано Kyrgyz/KG
    return /\b(район|област|область|республика|страна|киргиз|кыргыз|kyrgyz|kg)\b/.test(s);
  }, []);

  const distMeters = useCallback((a, b) => {
    if (!a || !b) return Infinity;
    const lat1 = Number.isFinite(a.lat) ? a.lat : Number.isFinite(a.latitude) ? a.latitude : null;
    const lon1 = Number.isFinite(a.lon) ? a.lon : Number.isFinite(a.longitude) ? a.longitude : null;
    const lat2 = Number.isFinite(b.lat) ? b.lat : Number.isFinite(b.latitude) ? b.latitude : null;
    const lon2 = Number.isFinite(b.lon) ? b.lon : Number.isFinite(b.longitude) ? b.longitude : null;
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
      return Infinity;
    }
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * sinLon * sinLon;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
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
  const activeFieldRef = useRef(null); // Ref для избежания race condition с blur
  const prevDestinationRef = useRef(null); // Для отслеживания был ли destination до изменения startPoint
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
  const [showEditHint, setShowEditHint] = useState(false);
  const isInitializedRef = useRef(false); // Флаг для предотвращения повторной инициализации
  // Встроенная авторизация перед заказом
  const [authOpen, setAuthOpen] = useState(false);
  const [authStep, setAuthStep] = useState(1); // 1: телефон, 2: код (+ имя при регистрации)
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authPhone, setAuthPhone] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authDevHint, setAuthDevHint] = useState('');
  const [user, setUser] = useState(null);

  const authRequestCode = useCallback(async () => {
    const trimmed = (authPhone || '').trim();
    const normalized = normalizeKgPhone(trimmed);
    if (!normalized.e164) {
      Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    setAuthLoading(true);
    try {
      const response = await requestAuthCode(trimmed);
      const phoneDisplay = response?.phoneDisplay || response?.phone || normalized.display;
      setAuthPhone(phoneDisplay);
      setAuthMode(response?.userExists === false ? 'register' : 'login');
      if (response?.devCode) {
        const hint = `Код (dev): ${response.devCode}`;
        setAuthDevHint(hint);
        try { Alert.alert('Код отправлен', `Ваш код: ${response.devCode}`); } catch {}
      } else {
        setAuthDevHint('');
        try { Alert.alert('Код отправлен', 'Введите код из SMS'); } catch {}
      }
      setAuthStep(2);
      setAuthCode('');
    } catch (err) {
      console.error('[AUTH] Request code failed:', err);
      const msg = err?.message === 'invalid_phone_number' ? 'Введите корректный номер телефона' : 'Не удалось отправить код';
      Alert.alert('Ошибка', msg);
    } finally {
      setAuthLoading(false);
    }
  }, [authPhone, requestAuthCode, normalizeKgPhone]);

  const authVerify = useCallback(async () => {
    const trimmedCode = (authCode || '').trim();
    const normalized = normalizeKgPhone(authPhone);
    if (!normalized.e164) {
      Alert.alert('Ошибка', 'Введите корректный номер телефона');
      return;
    }
    if (!trimmedCode) {
      Alert.alert('Ошибка', 'Введите код из SMS');
      return;
    }
    const cleanName = (authName || '').trim();
    if (authMode === 'register' && !cleanName) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }
    const currentMode = authMode;
    setAuthLoading(true);
    try {
      const payload = { phone: normalized.e164, code: trimmedCode };
      if (currentMode === 'register' && cleanName) {
        payload.name = cleanName;
      }
      const result = await verifyAuthApi(payload);
      if (result?.token) {
        await AsyncStorage.setItem('tow_token', result.token);
      }
      if (result?.user) {
        await AsyncStorage.setItem('tow_user', JSON.stringify(result.user));
      }
      try { emitEvent('auth:changed', { user: result?.user || null, token: result?.token || null, action: 'login' }); } catch {}
      setAuthOpen(false);
      setAuthStep(1);
      setAuthMode('login');
      setAuthCode('');
      setAuthName('');
      setAuthDevHint('');
      setAuthPhone(result?.phoneDisplay || result?.phone || normalized.display);
      const successMsg = currentMode === 'register' ? 'Аккаунт создан, вы вошли' : 'Вы вошли в аккаунт';
      Alert.alert('Готово', successMsg);
    } catch (err) {
      console.error('[AUTH] Verify failed:', err);
      const msg = err?.message === 'invalid_phone_number' ? 'Введите корректный номер телефона' : (err?.message || 'Не удалось подтвердить код');
      Alert.alert('Ошибка', msg);
    } finally {
      setAuthLoading(false);
    }
  }, [authPhone, authCode, authName, authMode, verifyAuthApi, normalizeKgPhone]);

  const [permissionStatus, setPermissionStatus] = useState('checking'); // 'checking' | 'granted' | 'prompt'
  const [canAskAgain, setCanAskAgain] = useState(true);
  const addrARef = useRef(null);
  const addrBRef = useRef(null);

  // Resolve API base for device (replace localhost with Metro host IP)
  const getApiBase = useCallback(() => {
    const configured = extra?.apiBase;
    if (typeof configured === 'string' && configured.length) {
      if (/localhost|127\.0\.0\.1/.test(configured)) {
        const hostUri = Constants?.expoConfig?.hostUri;
        const host = hostUri ? hostUri.split(':')[0] : null;
        if (host) {
          return configured.replace(/https?:\/\/(localhost|127\.0\.0\.1)/, `http://${host}`);
        }
      }
      return configured;
    }
    const hostUri = Constants?.expoConfig?.hostUri;
    const host = hostUri ? hostUri.split(':')[0] : null;
    return host ? `http://${host}:4001` : 'http://192.168.0.101:4001';
  }, []);

  const reverseAddressBest = useCallback(async (lat, lon) => {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`; // Округление до ~11м для лучшего кэширования
    const cached = geocodeCacheRef.current.get(key);
    if (cached) return cached;

    // 2GIS backend reverse geocoding
    try {
      const url = `${getApiBase()}/geocode/reverse?lat=${lat}&lon=${lon}`;
      const j = await fetchJSON(url);
      const address = j?.address || null;
      if (address && !isPlusCode(address)) {
        const res = normalizeAddr(address);
        geocodeCacheRef.current.set(key, res);
        return res;
      }
    } catch (_) {}

    // Последний шанс — встроенный геокодер устройства
    try {
      const arr = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (Array.isArray(arr) && arr.length) {
        const it = arr[0] || {};
        const street = it.street || it.name || null;
        const house = it.streetNumber || it.name || null;
        if (street && house && !isPlusCode(`${street}, ${house}`)) {
          const res = normalizeAddr(`${street}, ${house}`);
          geocodeCacheRef.current.set(key, res);
          return res;
        }
        if (street && !isPlusCode(street)) {
          const res = normalizeAddr(street);
          geocodeCacheRef.current.set(key, res);
          return res;
        }
      }
    } catch (_) {}

    // Если ничего не найдено или только Plus Codes, возвращаем координаты
    const coordsStr = formatCoords(lat, lon);
    geocodeCacheRef.current.set(key, coordsStr);
    return coordsStr;
  }, [fetchJSON, normalizeAddr, isPlusCode, formatCoords]);
  // Прямое геокодирование текстового адреса -> координаты и строка адреса
  const geocodeTextBest = useCallback(async (query) => {
    if (!query || typeof query !== 'string') return null;
    const raw = query.trim();
    
    // Проверка кэша - экономия API запросов
    const cacheKey = raw.toLowerCase();
    const cached = geocodeTextCacheRef.current.get(cacheKey);
    if (cached) {
      console.log('[GEOCODE] Using cached results for:', raw);
      return cached;
    }
    
    const narrowedQ = /киргиз|кыргыз|kyrgyz|kg/i.test(raw) ? raw : `Кыргызстан, ${raw}`;
    const q = encodeURIComponent(narrowedQ);
  const maptilerKey = extra?.maptilerApiKey;

    if (maptilerKey) {
      try {
        // MapTiler Geocoding API - forward geocoding с bbox для Кыргызстана
        const bbox = '69.2,39.1,80.3,43.3'; // Кыргызстан bbox
        const url = `https://api.maptiler.com/geocoding/${q}.json?key=${maptilerKey}&language=ru&bbox=${bbox}&limit=5`;
        const j = await fetchJSON(url);
        const features = j?.features || [];
        if (features.length) {
          for (const feat of features) {
            const coords = feat?.geometry?.coordinates || feat?.center;
            if (Array.isArray(coords) && coords.length >= 2) {
              const lon = coords[0];
              const lat = coords[1];
              if (Number.isFinite(lat) && Number.isFinite(lon) && isInKG(lat, lon)) {
                const addr = normalizeAddr(feat?.place_name || feat?.text || raw);
                const result = { latitude: lat, longitude: lon, address: addr };
                
                // Сохранение в кэш с LRU - максимум 50 записей
                if (geocodeTextCacheRef.current.size > 50) {
                  const firstKey = geocodeTextCacheRef.current.keys().next().value;
                  geocodeTextCacheRef.current.delete(firstKey);
                }
                geocodeTextCacheRef.current.set(cacheKey, result);
                
                return result;
              }
            }
          }
        }
      } catch(_) {}
    }

    return null;
  }, [fetchJSON, normalizeAddr, isInKG]);

  const suggestPlaces = useCallback(async (input) => {
    const raw = (input || '').trim();
    if (!raw) return [];
    
    // Проверяем кэш для экономии API запросов
    const cacheKey = raw.toLowerCase();
    const cached = suggestCacheRef.current.get(cacheKey);
    if (cached) {
      console.log('[SUGGEST] Using cached results for:', raw);
      return cached;
    }
    
    // Используем backend 2GIS suggest для качественных подсказок полных адресов
    try {
      const url = `${getApiBase()}/geocode/suggest?query=${encodeURIComponent(raw)}&limit=8`;
      const j = await fetchJSON(url);
      const results = j?.results || [];
      
      const mapped = results.map(item => ({
        title: item.title || raw,
        subtitle: item.subtitle || null,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address || item.title || raw,
      }));
      
      // Сохраняем в кэш (максимум 50 записей)
      if (suggestCacheRef.current.size > 50) {
        const firstKey = suggestCacheRef.current.keys().next().value;
        suggestCacheRef.current.delete(firstKey);
      }
      suggestCacheRef.current.set(cacheKey, mapped);
      
      return mapped;
    } catch (err) {
      console.warn('[SUGGEST] Error:', err);
      return [];
    }
  }, [fetchJSON, getApiBase]);

  // Дебаунс подсказок при вводе в A/B
  useEffect(() => {
    const q = activeField === 'A' ? addrA : activeField === 'B' ? addrB : null;
    if (!activeField) return;
    if (suggestTimerRef.current) { clearTimeout(suggestTimerRef.current); suggestTimerRef.current = null; }
    // Увеличили минимум до 3 символов для экономии API запросов
    if (!q || q.trim().length < 3) { setSuggestions([]); setSuggesting(false); return; }
    setSuggesting(true);
    // Увеличили задержку до 500мс для экономии API запросов
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const list = await suggestPlaces(q);
        setSuggestions(list);
      } catch (_) {
        setSuggestions([]);
      } finally {
        setSuggesting(false);
      }
    }, 500);
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


  // ...

  // Стабильные колбэки для карты (не меняются между рендерами)
  const onMapReady = useCallback(() => {}, []);
  const onMapClickCb = useCallback((p) => {
    const { latitude, longitude } = p;
    Keyboard.dismiss();
    // Используем только ref чтобы избежать race condition с onBlur
    const currentActiveField = activeFieldRef.current;
    console.log('[MAP CLICK] activeFieldRef:', activeFieldRef.current, 'chosen:', currentActiveField);
    // Если активно поле A — выбор точки по карте заполняет A и ставит старт
    if (currentActiveField === 'A') {
      // НЕ удаляем destination и pending - точка B должна оставаться
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
      activeFieldRef.current = null;
      setSuggestions([]);
      // Асинхронно уточняем адрес и номер дома
      (async () => {
        try {
          // Если карта вернула адрес, используем его только если он не выглядит как уровень района/страны.
          // Иначе — принудительно обращаемся к нашему backend reverse (2GIS parsing).
          let addr = null;
          if (p.address && typeof p.address === 'string') {
            const cand = normalizeAddr(p.address);
            if (cand && !isRegionLevelAddr(cand)) {
              addr = cand;
            }
          }
          if (!addr) {
            addr = await reverseAddressBest(latitude, longitude);
          }

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
    // При клике на карту для B - НЕ очищаем маршрут, пусть остается пока строится новый
    console.log('[MAP CLICK] Setting pending for point B:', { latitude, longitude, address: p.address });
    const initial = { latitude, longitude };
    if (p.address) initial.address = normalizeAddr(p.address);
    setPending(initial);
    if (p.address && typeof p.address === 'string') {
      try { setAddrB(normalizeAddr(p.address)); } catch(_) {}
    } else {
      setAddrB('');
    }
    setActiveField(null);
    activeFieldRef.current = null;
    setSuggestions([]);
    (async () => {
      try {
        if (p.address && typeof p.address === 'string') {
          // Если карта дала адрес, используем его только если он не выглядит как уровень района/страны.
          let cand = normalizeAddr(p.address);
          let addr = null;
          if (cand && !isRegionLevelAddr(cand)) {
            addr = cand;
          }
          if (!addr) {
            addr = await reverseAddressBest(latitude, longitude);
          }
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
  }, [reverseAddressBest, normalizeAddr, hasHouseNumber, refineHouseNumber, extractBaseStreet, fetchJSON]);
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
      if (payload && payload.user && payload.action === 'profile:update') {
        try {
          await AsyncStorage.setItem('tow_user', JSON.stringify(payload.user));
        } catch {}
      }
    });
    return () => { try { off && off(); } catch {} };
  }, [placeOrder]);

  // Автоматическое построение маршрута когда есть точка A и pending точка B
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Проверяем: есть ли startPoint (точка A) и pending (точка B)?
      if (!startPoint || !pending) return;
      if (!pending.latitude || !pending.longitude) return;
      
      console.log('[AUTO BUILD] Building route from', startPoint, 'to', pending);
      
      // ВАЖНО: Фиксируем точку A при первом построении маршрута, чтобы она не двигалась
      if (!startIsManualRef.current) {
        setStartIsManual(true);
        startIsManualRef.current = true;
        setStartVisible(true);
        console.log('[AUTO BUILD] Locking point A at', startPoint);
      }
      
      // Начинаем построение (очищаем старый маршрут если был)
      setIsBuilding(true);
      setDestination(null);
      setRouteInfo(null);
      
      // Устанавливаем destination чтобы карта построила маршрут
      try {
        let addr = pending.address;
        if (!addr) {
          addr = await reverseAddressBest(pending.latitude, pending.longitude);
          if (addr && !hasHouseNumber(addr)) {
            const baseSt = extractBaseStreet(addr);
            const refined = await refineHouseNumber(pending.latitude, pending.longitude, baseSt);
            if (refined) addr = refined;
          }
        }
        setAddrB(addr || null);
        
        // Небольшая задержка перед установкой destination чтобы карта успела очиститься
        setTimeout(() => {
          setDestination({ latitude: pending.latitude, longitude: pending.longitude });
          setPending(null);
        }, 100);
      } catch (e) {
        console.error('[AUTO BUILD] Error:', e);
        setIsBuilding(false);
      }
    }, 1000); // Задержка 1 секунда чтобы дать пользователю время на корректировку
    
    return () => clearTimeout(timer);
  }, [startPoint, pending, reverseAddressBest, hasHouseNumber, extractBaseStreet, refineHouseNumber]);

  // Перестроение маршрута когда изменилась точка A (startPoint) и уже есть точка B (destination)
  useEffect(() => {
    // Сохраняем текущий destination для следующего вызова
    const hadDestination = prevDestinationRef.current !== null;
    prevDestinationRef.current = destination;
    
    // Если нет startPoint или нет destination - ничего не делаем
    if (!startPoint || !destination) return;
    
    // Если destination только что появился (не было раньше) - не перестраиваем, первый билд уже идёт
    if (!hadDestination) return;
    
    const timer = setTimeout(() => {
      console.log('[AUTO REBUILD] Rebuilding route: startPoint changed, destination exists');
      
      // Перестраиваем маршрут
      setIsBuilding(true);
      setRouteInfo(null);
      
      // Сбрасываем и заново устанавливаем destination чтобы карта перестроила маршрут
      const dest = { ...destination };
      setDestination(null);
      
      setTimeout(() => {
        setDestination(dest);
      }, 100);
    }, 500); // Меньшая задержка так как это перестроение, а не новое построение
    
    return () => clearTimeout(timer);
  }, [startPoint, destination]);

  // Показать подсказку о редактировании когда есть адрес
  useEffect(() => {
    // Показываем подсказку если есть любой адрес
    if ((addrA && addrA.trim()) || (addrB && addrB.trim())) {
      console.log('[EDIT HINT] Address detected, showing hint');
      setShowEditHint(true);
    }
  }, [addrA, addrB]);

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
            { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 10 },
          (update) => {
            const { latitude: lat, longitude: lng } = update.coords;
            const newCoords = { latitude: lat, longitude: lng };
            
            // Обновляем состояние только если координаты действительно изменились
            setUserCoords(prev => {
              if (!prev || Math.abs(prev.latitude - lat) > 0.00001 || Math.abs(prev.longitude - lng) > 0.00001) {
                return newCoords;
              }
              return prev;
            });
            
            if (!startIsManualRef.current) {
              setStartPoint(prev => {
                if (!prev || Math.abs(prev.latitude - lat) > 0.00001 || Math.abs(prev.longitude - lng) > 0.00001) {
                  return newCoords;
                }
                return prev;
              });
            }
            
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
    // Только при первой инициализации
    if (isInitializedRef.current) return;
    
    let mounted = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        setCanAskAgain(current.canAskAgain ?? true);
        if (current.status === 'granted') {
          setPermissionStatus('granted');
          startLocationFlow();
          isInitializedRef.current = true;
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
      // НЕ удаляем watchRef при размонтировании для сохранения отслеживания
    };
  }, []);

  // Загрузка данных пользователя
  useEffect(() => {
    const loadUser = async () => {
      try {
        const raw = await AsyncStorage.getItem('tow_user');
        if (raw) setUser(JSON.parse(raw));
      } catch (_) {}
    };
    loadUser();

    const handleAuthChange = () => loadUser();
    onEvent('auth:changed', handleAuthChange);
    
    return () => {
      // Отписка от события
      try {
        // eventBus не имеет off метода, но мы можем игнорировать это
      } catch(_) {}
    };
  }, []);

  // Очистка при полном размонтировании компонента
  useEffect(() => {
    return () => {
      // Останавливаем отслеживание только при полном размонтировании
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
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

  // Мемоизация центра карты для предотвращения ненужных ре-рендеров
  const mapCenter = React.useMemo(() => {
    if (!region) return null;
    return { latitude: region.latitude, longitude: region.longitude };
  }, [region?.latitude, region?.longitude]);

  // Мемоизация startPoint для карты
  const mapStartPoint = React.useMemo(() => {
    const point = startPoint || userCoords;
    if (!point) return null;
    return { latitude: point.latitude, longitude: point.longitude };
  }, [startPoint?.latitude, startPoint?.longitude, userCoords?.latitude, userCoords?.longitude]);

  // Мемоизация recenterCoords
  const mapRecenterCoords = React.useMemo(() => {
    if (!userCoords) return null;
    return { latitude: userCoords.latitude, longitude: userCoords.longitude };
  }, [userCoords?.latitude, userCoords?.longitude]);

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
          {/* Кнопка меню в правом верхнем углу с анимацией scale */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 50,
              right: 15,
              zIndex: 1000,
              transform: [{ scale: menuScaleAnim }],
            }}
          >
            <TouchableOpacity
              onPressIn={() => {
                Animated.spring(menuScaleAnim, {
                  toValue: 0.85,
                  useNativeDriver: true,
                  speed: 50,
                  bounciness: 4,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(menuScaleAnim, {
                  toValue: 1,
                  useNativeDriver: true,
                  speed: 50,
                  bounciness: 4,
                }).start();
              }}
              onPress={() => {
                setMenuVisible(true);
                Animated.spring(menuModalScale, {
                  toValue: 1,
                  useNativeDriver: true,
                  speed: 12,
                  bounciness: 8,
                }).start();
              }}
              style={{
                backgroundColor: 'white',
                borderRadius: 8,
                padding: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
              }}
              activeOpacity={1}
            >
              <MaterialIcons name="menu" size={24} color="#000" />
            </TouchableOpacity>
          </Animated.View>

          <MapViewProvider
            center={mapCenter}
            zoom={15}
            destination={destination}
            preview={pending}
            start={mapStartPoint}
            startIsManual={startIsManual}
            startVisible={startVisible}
            userLocation={userCoords}
            recenterAt={recenterTick}
            recenterCoords={mapRecenterCoords}
            resetAt={resetTick}
            clearDestinationAt={clearDestTick}
            clearRouteOnlyAt={clearRouteTick}
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
  <TouchableOpacity 
    style={styles.addrInputsWrap} 
    activeOpacity={1}
    onPress={() => {/* Блокируем клики, чтобы они не проходили на карту */}}
  >
        {/* Информация о маршруте или индикатор загрузки */}
        {isBuilding && destination && !routeInfo ? (
          <View style={styles.routeBadge}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0a84ff" style={{ marginRight: 8 }} />
              <Text style={styles.routeText}>Строится маршрут...</Text>
            </View>
          </View>
        ) : routeInfo ? (
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
        ) : null}
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
                      // При выборе A - НЕ удаляем точку B, только обновляем точку старта
                      // Центруем карту, не трогая координаты пользователя
                      setRegion({ latitude: sug.latitude, longitude: sug.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
                      // Устанавливаем ручной старт A
                      setStartPoint({ latitude: sug.latitude, longitude: sug.longitude });
                      setStartIsManual(true);
                      startIsManualRef.current = true;
                      setStartVisible(true);
                      setLastUserEditAt(Date.now());
                    }
                  } else if (activeField === 'B') {
                    setAddrB(sug.address || sug.title);
                    if (Number.isFinite(sug.latitude) && Number.isFinite(sug.longitude)) {
                      // При выборе B из suggest - сразу строим маршрут
                      const newDest = { latitude: sug.latitude, longitude: sug.longitude };
                      setDestination(newDest);
                      setPending(null);
                      setLastUserEditAt(Date.now());
                      // Если есть точка A - маршрут построится автоматически через useEffect
                    }
                  }
                  setSuggestions([]);
                  setActiveField(null);
                  activeFieldRef.current = null;
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
            placeholder="Откуда (можно уточнить: участок, дом и т.д.)"
            value={addrA ?? ''}
    onFocus={() => { setActiveField('A'); activeFieldRef.current = 'A'; }}
    onBlur={() => { 
      // Задержка перед сбросом, чтобы onMapClickCb успел прочитать значение
      setTimeout(() => {
        setActiveField(null); 
        activeFieldRef.current = null;
      }, 300);
    }}
  onChangeText={(t) => { setAddrA(t); setActiveField('A'); activeFieldRef.current = 'A'; setLastUserEditAt(Date.now()); }}
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
                  setLastUserEditAt(Date.now());
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
              
              // Активируем поле A для выбора с карты (без открытия клавиатуры)
              setActiveField('A');
              activeFieldRef.current = 'A';
              // НЕ фокусируем input чтобы клавиатура не открывалась
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
        </View>
  <View style={[styles.addrRow, { marginTop: 8 }]} pointerEvents="auto">
          <TextInput
            ref={addrBRef}
            style={styles.addrInput}
            placeholder="Куда (можно уточнить: участок, дом и т.д.)"
            value={addrB ?? (pending && pending.address ? normalizeAddr(pending.address) : '')}
            onFocus={() => { setActiveField('B'); activeFieldRef.current = 'B'; }}
            onBlur={() => { 
              // Задержка перед сбросом, чтобы onMapClickCb успел прочитать значение
              setTimeout(() => {
                setActiveField(null); 
                activeFieldRef.current = null;
              }, 300);
            }}
            onChangeText={(t) => { setAddrB(t); setActiveField('B'); activeFieldRef.current = 'B'; setLastUserEditAt(Date.now()); }}
            editable
            returnKeyType="search"
            onSubmitEditing={async () => {
              try {
                const res = await geocodeTextBest(addrB);
                if (res) {
                  // При ручном вводе B - сразу устанавливаем destination для автоматического построения маршрута
                  setAddrB(res.address || addrB);
                  setDestination({ latitude: res.latitude, longitude: res.longitude });
                  setPending(null);
                  setSuggestions([]);
                  setActiveField(null);
                  setLastUserEditAt(Date.now());
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
              setClearRouteTick(t=>t+1);
              // НЕ вызываем setResetTick - точка A должна остаться на месте
              setSuggestions([]);
              
              // Активируем поле B для выбора с карты (без открытия клавиатуры)
              setActiveField('B');
              activeFieldRef.current = 'B';
              // НЕ фокусируем input чтобы клавиатура не открывалась
            }}
          >
            <MaterialIcons name="close" size={20} color="#0a84ff" />
          </TouchableOpacity>
        </View>
        
        {/* Подсказка о возможности редактирования адреса */}
        {showEditHint && (
          <View style={styles.editHint}>
            <MaterialIcons name="info" size={16} color="#0a84ff" style={{ marginRight: 6 }} />
            <Text style={styles.editHintText}>
              💡 Адрес можно уточнить: добавьте номер участка, дома или ориентир
            </Text>
            <TouchableOpacity onPress={() => setShowEditHint(false)} style={{ marginLeft: 8 }}>
              <MaterialIcons name="close" size={16} color="#666" />
            </TouchableOpacity>
          </View>
        )}
        
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
      </TouchableOpacity>

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

      {/* Модальное меню */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          Animated.timing(menuModalScale, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => setMenuVisible(false));
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
          activeOpacity={1}
          onPress={() => {
            Animated.timing(menuModalScale, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => setMenuVisible(false));
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 50,
              right: 15,
              width: 260,
              backgroundColor: 'white',
              borderRadius: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 10,
              transform: [{ scale: menuModalScale }],
              transformOrigin: 'top right',
            }}
          >
            {/* Профиль */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 18,
                borderBottomWidth: 1,
                borderBottomColor: '#f0f0f0',
              }}
              onPress={() => {
                setMenuVisible(false);
                menuModalScale.setValue(0);
                navigation.navigate('Профиль');
              }}
            >
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#4A90E2',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <MaterialIcons name="person" size={26} color="#fff" />
              </View>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111' }}>
                  {user?.name || 'Пользователь'}
                </Text>
                <Text style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  {user?.phone || 'Базовый план'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* ОСНОВНОЕ */}
            <View style={{ paddingTop: 10 }}>
              <Text style={{ 
                fontSize: 11, 
                fontWeight: '600', 
                color: '#999', 
                paddingHorizontal: 18, 
                paddingVertical: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                ОСНОВНОЕ
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                }}
                onPress={() => {
                  setMenuVisible(false);
                  menuModalScale.setValue(0);
                  navigation.navigate('История заказов');
                }}
              >
                <MaterialIcons name="history" size={22} color="#666" />
                <Text style={{ marginLeft: 14, fontSize: 15, color: '#111' }}>История</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                }}
                onPress={() => {
                  setMenuVisible(false);
                  menuModalScale.setValue(0);
                  // Активность - заглушка
                }}
              >
                <MaterialIcons name="bolt" size={22} color="#666" />
                <Text style={{ marginLeft: 14, fontSize: 15, color: '#111' }}>Активность</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                }}
                onPress={() => {
                  setMenuVisible(false);
                  menuModalScale.setValue(0);
                  // Интеграции - заглушка
                }}
              >
                <MaterialIcons name="link" size={22} color="#666" />
                <Text style={{ marginLeft: 14, fontSize: 15, color: '#111' }}>Интеграции</Text>
              </TouchableOpacity>
            </View>

            {/* НАСТРОЙКИ */}
            <View style={{ paddingTop: 10 }}>
              <Text style={{ 
                fontSize: 11, 
                fontWeight: '600', 
                color: '#999', 
                paddingHorizontal: 18, 
                paddingVertical: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                НАСТРОЙКИ
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                }}
                onPress={() => {
                  setMenuVisible(false);
                  menuModalScale.setValue(0);
                  navigation.navigate('Настройки');
                }}
              >
                <MaterialIcons name="settings" size={22} color="#666" />
                <Text style={{ marginLeft: 14, fontSize: 15, color: '#111' }}>Настройки</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                }}
                onPress={() => {
                  setMenuVisible(false);
                  menuModalScale.setValue(0);
                  navigation.navigate('Служба поддержки');
                }}
              >
                <MaterialIcons name="support-agent" size={22} color="#666" />
                <Text style={{ marginLeft: 14, fontSize: 15, color: '#111' }}>Поддержка</Text>
              </TouchableOpacity>
            </View>

            {/* Выход */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 15,
                paddingHorizontal: 18,
                borderTopWidth: 1,
                borderTopColor: '#f0f0f0',
                marginTop: 8,
              }}
              onPress={async () => {
                setMenuVisible(false);
                menuModalScale.setValue(0);
                try {
                  await AsyncStorage.removeItem('tow_user');
                  await AsyncStorage.removeItem('tow_token');
                  setUser(null);
                  emitEvent('auth:changed');
                  Alert.alert('Выход', 'Вы вышли из системы');
                } catch (_) {}
              }}
            >
              <MaterialIcons name="logout" size={22} color="#E74C3C" />
              <Text style={{ marginLeft: 14, fontSize: 15, color: '#E74C3C' }}>Выход</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
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
  editIconContainer: {
    width: 24,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
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
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#b3d9ff',
  },
  editHintText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  addrFillBtn: {
    marginLeft: 8,
    marginRight: 0,
    width: 44,
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
