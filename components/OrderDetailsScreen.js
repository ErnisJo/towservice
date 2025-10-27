import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

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

  // Backward compatibility: try to parse from location string if structured fields are missing
  let fromAddr = order.fromAddress;
  let toAddr = order.toAddress;
  if ((!fromAddr || !toAddr) && typeof order.location === 'string') {
    const m = order.location.match(/A:\s*(.*?)\s*→\s*B:\s*(.*)/);
    if (m) { fromAddr = fromAddr || m[1]; toAddr = toAddr || m[2]; }
  }

  const created = order.createdAt ? new Date(order.createdAt) : null;
  const started = order.startedAt ? new Date(order.startedAt) : null;
  const arrived = order.arrivedAt ? new Date(order.arrivedAt) : null;

  // Distance/duration disabled by request; show only stored values
  const km = null;
  const cost = (typeof order.cost === 'number' && isFinite(order.cost)) ? order.cost : (typeof order.finalCost === 'number' && isFinite(order.finalCost) ? order.finalCost : null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Детали заказа</Text>
      <View style={styles.card}>
        <Row label="Откуда" value={renderValue(fromAddr)} />
        <Row label="Куда" value={renderValue(toAddr)} />
        <Row label="Создан" value={created ? created.toLocaleString() : '—'} />
        <Row label="Начали движение" value={started ? started.toLocaleString() : '—'} />
        <Row label="Доставлен" value={arrived ? arrived.toLocaleString() : '—'} />
  <Row label="Расстояние" value={'—'} />
        <Row label="Марка и модель" value={renderValue([order.vehicleMake, order.vehicleModel].filter(Boolean).join(' '))} />
        <Row label="Гос. номер" value={renderValue(order.plateNumber)} />
        <Row label="Цвет кузова" value={renderValue(order.vehicleColor)} />
        <Row label="Водитель" value={renderValue(order.driverName)} />
        <Row label="Итоговая стоимость" value={cost != null ? `${cost} сом` : '—'} />
      </View>
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
});
