import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STATUS_MAP = {
  pending: 'Ожидает подтверждения',
  accepted: 'Принят исполнителем',
  in_progress: 'В пути',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const META_OMIT_KEYS = new Set([
  'distance', 'distancekm', 'distancekm', 'duration', 'durationminutes', 'durationmins', 'durationsec',
  'finalcost', 'total', 'paymentmethod', 'drivername', 'driverphone', 'fromaddress', 'toaddress',
  'notes', 'comment', 'customername', 'customerphone', 'vehiclemake', 'vehiclemodel', 'platenumber',
  'vehiclecolor', 'startcoords', 'destcoords',
]);

const coalesce = (...values) => {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

export default function OrderDetailsScreen({ route }) {
  const { id } = route.params || {};
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tariff is not used for calculations here; cost is stored with order

  const getApiBase = useCallback(() => {
    const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
    if (/localhost|127\.0\.0\.1/.test(cfg) && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:4000`;
      } catch (_) {}
    }
    return cfg;
  }, []);

  // Helper to avoid hanging fetch (React Native fetch has no default timeout)
  const fetchWithTimeout = useCallback(async (url, opts = {}, timeout = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }, []);

  const load = useCallback(async () => {
    // Try show cached order immediately to avoid long spinner
    let localFound = null;
    try {
      const raw = await AsyncStorage.getItem('tow_requests');
      const list = raw ? JSON.parse(raw) : [];
      const found = list.find(it => it.id === id);
      if (found) {
        localFound = found;
        setOrder(found);
        setLoading(false);
      }
    } catch (_) {
      // ignore parsing errors
    }

    // Fetch remote and update if available (background). Use timeout.
    try {
      const base = getApiBase();
      const token = await AsyncStorage.getItem('tow_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetchWithTimeout(base + '/orders/' + id + '?t=' + Date.now(), { cache: 'no-store', headers }, 8000);
      if (res.ok) {
        const o = await res.json();
        setOrder(o || null);
        setLoading(false);
        return;
      }
    } catch (_) {}

    // If no local found and remote failed, try local one more time and stop loading
    if (!localFound) {
      try {
        const raw = await AsyncStorage.getItem('tow_requests');
        const list = raw ? JSON.parse(raw) : [];
        const found = list.find(it => it.id === id);
        setOrder(found || null);
      } catch (_) {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    }
  }, [id, getApiBase, fetchWithTimeout]);

  useEffect(() => { load(); }, [load]);

  const renderValue = (v) => (v == null || v === '' ? '—' : String(v));

  const metaEntries = useMemo(() => {
    if (!order || !order.meta || typeof order.meta !== 'object') return [];
    return Object.entries(order.meta)
      .filter(([key, value]) => {
        if (value === null || value === undefined || value === '') return false;
        if (META_OMIT_KEYS.has(String(key).toLowerCase())) return false;
        return true;
      })
      .map(([key, value]) => {
        if (typeof value === 'object') {
          try { return [key, JSON.stringify(value)]; } catch (_) { return [key, '[object]']; }
        }
        return [key, String(value)];
      });
  }, [order]);

  const addresses = useMemo(() => {
    if (!order) return { from: null, to: null };
    const details = (order.details && typeof order.details === 'object') ? order.details : {};
    const meta = (order.meta && typeof order.meta === 'object') ? order.meta : {};
    let from = coalesce(
      order.fromAddress,
      order.from_address,
      order.addressFrom,
      details.fromAddress,
      details.addressFrom,
      meta.fromAddress,
      meta.addressFrom,
      meta.pickupAddress,
      meta.originAddress,
      meta.origin
    );
    let to = coalesce(
      order.toAddress,
      order.to_address,
      order.addressTo,
      details.toAddress,
      details.addressTo,
      meta.toAddress,
      meta.addressTo,
      meta.dropoffAddress,
      meta.destinationAddress,
      meta.destination
    );
    if ((!from || !to) && typeof order.location === 'string') {
      const match = order.location.match(/A:\s*(.*?)\s*→\s*B:\s*(.*)/);
      if (match) {
        if (!from) from = match[1];
        if (!to) to = match[2];
      }
    }
    return { from, to };
  }, [order]);

  if (loading) {
    return (
      <View style={styles.center}> 
        <ActivityIndicator size="small" color="#0a84ff" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Заказ не найден</Text>
      </View>
    );
  }

  const fromAddr = addresses.from;
  const toAddr = addresses.to;

  const created = order.createdAt ? new Date(order.createdAt) : null;
  const started = order.startedAt ? new Date(order.startedAt) : null;
  const arrived = order.arrivedAt ? new Date(order.arrivedAt) : null;
  const updated = order.updatedAt ? new Date(order.updatedAt) : null;

  const km = (() => {
    if (typeof order.distance === 'number' && isFinite(order.distance)) return Math.max(0, order.distance / 1000);
    const meta = order.meta || {};
    if (typeof meta.distanceKm === 'number' && isFinite(meta.distanceKm)) return Math.max(0, meta.distanceKm);
    if (typeof meta.distanceKM === 'number' && isFinite(meta.distanceKM)) return Math.max(0, meta.distanceKM);
    if (typeof meta.distance === 'number' && isFinite(meta.distance)) return Math.max(0, meta.distance / 1000);
    return null;
  })();

  const durationMins = (() => {
    if (typeof order.duration === 'number' && isFinite(order.duration)) return Math.max(0, Math.round(order.duration / 60));
    const meta = order.meta || {};
    if (typeof meta.durationMinutes === 'number' && isFinite(meta.durationMinutes)) return Math.max(0, Math.round(meta.durationMinutes));
    if (typeof meta.durationMins === 'number' && isFinite(meta.durationMins)) return Math.max(0, Math.round(meta.durationMins));
    if (typeof meta.durationSec === 'number' && isFinite(meta.durationSec)) return Math.max(0, Math.round(meta.durationSec / 60));
    return null;
  })();

  const cost = (typeof order.cost === 'number' && isFinite(order.cost)) ? order.cost : (typeof order.finalCost === 'number' && isFinite(order.finalCost) ? order.finalCost : null);
  const formatSom = (value) => {
    if (value == null) return '—';
    try {
      return `${new Intl.NumberFormat('ru-RU').format(value)} сом`;
    } catch (_) {
      return `${value} сом`;
    }
  };
  const distanceLabel = km != null ? `${km.toFixed(1)} км` : '—';
  const durationLabel = durationMins != null ? `${durationMins} мин` : '—';
  const costLabel = formatSom(cost);

  const statusRaw = order.status || order.details?.status;
  const statusLabel = statusRaw ? (STATUS_MAP[statusRaw] || statusRaw) : '—';
  const driverPhoneRaw = order.driverPhone || order.details?.driverPhone || order.meta?.driverPhone;
  const paymentMethodRaw = order.paymentMethod || order.details?.paymentMethod || order.meta?.paymentMethod;
  const notesRaw = order.notes || order.details?.notes || order.meta?.notes || order.meta?.comment;
  const customerNameRaw = order.customerName || order.meta?.customerName;
  const customerPhoneRaw = order.customerPhone || order.meta?.customerPhone;

  const driverPhone = renderValue(driverPhoneRaw);
  const paymentMethod = renderValue(paymentMethodRaw);
  const notes = renderValue(notesRaw);
  const customerName = renderValue(customerNameRaw);
  const customerPhone = renderValue(customerPhoneRaw);
  const showPayment = paymentMethodRaw != null && paymentMethodRaw !== '';
  const showCustomerName = customerNameRaw != null && customerNameRaw !== '';
  const showCustomerPhone = customerPhoneRaw != null && customerPhoneRaw !== '';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Детали заказа</Text>
      <View style={styles.card}>
        <Row label="Статус" value={statusLabel} />
        <Row label="Откуда" value={renderValue(fromAddr)} />
        <Row label="Куда" value={renderValue(toAddr)} />
        <Row label="Расстояние" value={distanceLabel} />
        <Row label="Длительность" value={durationLabel} />
        <Row label="Итоговая стоимость" value={costLabel} />
        {showPayment ? <Row label="Метод оплаты" value={paymentMethod} /> : null}
        <Row label="Создан" value={created ? created.toLocaleString() : '—'} />
        <Row label="Начали движение" value={started ? started.toLocaleString() : '—'} />
        <Row label="Доставлен" value={arrived ? arrived.toLocaleString() : '—'} />
        <Row label="Обновлён" value={updated ? updated.toLocaleString() : '—'} />
        <Row label="Марка и модель" value={renderValue([order.vehicleMake, order.vehicleModel].filter(Boolean).join(' '))} />
        <Row label="Гос. номер" value={renderValue(order.plateNumber)} />
        <Row label="Цвет кузова" value={renderValue(order.vehicleColor)} />
        <Row label="Водитель" value={renderValue(order.driverName)} />
        <Row label="Телефон водителя" value={driverPhone} />
        {showCustomerName ? <Row label="Клиент" value={customerName} /> : null}
        {showCustomerPhone ? <Row label="Телефон клиента" value={customerPhone} /> : null}
        <Row label="Комментарий" value={notes} />
      </View>
      {metaEntries.length > 0 ? (
        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>Дополнительные данные</Text>
          {metaEntries.map(([key, value]) => (
            <View key={key} style={styles.metaRow}>
              <Text style={styles.metaKey}>{key}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  muted: { color: '#777' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  label: { width: 140, color: '#555', fontWeight: '600' },
  value: { flex: 1, color: '#111' },
  metaCard: { marginTop: 16, borderWidth: 1, borderColor: '#e3e7f2', borderRadius: 12, padding: 12, backgroundColor: '#f7f9ff' },
  metaTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#2f3a54' },
  metaRow: { marginBottom: 6 },
  metaKey: { fontSize: 13, fontWeight: '600', color: '#4b5670' },
  metaValue: { fontSize: 13, color: '#1c1f2a', marginTop: 2 },
});
