import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, BackHandler, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getApiBase } from '../utils/apiBase';

const coalesce = (...values) => {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const asNumber = typeof value === 'number' ? value : Number(value);
  if (!Number.isNaN(asNumber) && String(value).trim() !== '' && Math.abs(asNumber) > 9999999999) {
    const fromNumber = new Date(asNumber);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : '—';
};

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const getApiBaseMemo = useCallback(() => getApiBase(), []);

  const load = useCallback(async () => {
    try {
      const base = getApiBaseMemo();
      const rawUser = await AsyncStorage.getItem('tow_user');
      const user = rawUser ? JSON.parse(rawUser) : null;
      const uid = user?.id;
      if (!uid) { setItems([]); return; }
      const token = await AsyncStorage.getItem('tow_token');
      const res = await fetch(base + `/users/${uid}/orders?t=` + Date.now(), { cache: 'no-store', headers: { ...(token ? { 'Authorization': 'Bearer ' + token } : {}) } });
      if (res.ok) {
        const list = await res.json();
        const arr = Array.isArray(list) ? list : [];
        setItems(arr);
    return;
      }
    } catch (_) {}
  // No local fallback — show empty
  setItems([])
  }, [getApiBaseMemo]);

  useEffect(() => {
    // Purge any old local caches (server-only policy)
    (async () => {
      try { await AsyncStorage.removeItem('tow_requests'); } catch {}
      try { await AsyncStorage.removeItem('tow_my_orders'); } catch {}
    })();
    load();
  }, [load]);

  // Обновлять список при каждом возвращении на экран
  useFocusEffect(
    useCallback(() => {
      load();
      // Перехватываем аппаратную кнопку «назад» на корневом экране истории,
      // для выхода на главную через BridgeToHome с анимацией слайда
      const onBack = () => {
        navigation.push('BridgeToHome');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => {
        sub.remove();
      };
    }, [load, navigation])
  );

  // Кнопку «назад» задаём централизованно в навигации (DrawerNavigator) —
  // здесь не переопределяем, чтобы избежать гонок и двойных обработчиков

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }) => {
    const cost = (typeof item.cost === 'number' && isFinite(item.cost)) ? item.cost : (typeof item.finalCost === 'number' && isFinite(item.finalCost) ? item.finalCost : null);
    const clean = (s) => {
      if (!s) return '';
      return String(s)
        .replace(/,?\s*[^,]*\bобл(?:\.|асть)?\b[^,]*/i, '')
        .replace(/\s+,/g, ',')
        .replace(/,+\s*$/, '')
        .trim();
    };
    let titleText = '';
    if (item.address) {
      titleText = clean(item.address);
    } else if (item.fromAddress || item.toAddress) {
      const a = item.fromAddress ? clean(item.fromAddress) : 'Точка A';
      const b = item.toAddress ? clean(item.toAddress) : 'Точка B';
      titleText = `${a} → ${b}`;
    } else if (typeof item.location === 'string' && item.location) {
      // обратная совместимость со старыми заказами
      titleText = clean(item.location.replace(/\bA:\s*/i, '').replace(/\bB:\s*/i, '')) || 'Без адреса';
    } else {
      titleText = 'Без адреса';
    }
    const note = item?.details?.notes ?? item?.notes;
    const createdRaw = coalesce(
      item?.createdAt,
      item?.created_at,
      item?.details?.createdAt,
      item?.details?.created_at,
      item?.meta?.createdAt,
      item?.meta?.created_at,
      item?.timestamp,
      item?.created
    );
    const createdLabel = formatDate(createdRaw);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate('OrderDetails', { id: item.id })}>
        <Text style={styles.cardTitle}>{titleText}</Text>
        {cost != null && <Text style={styles.cardText}>Сумма: {cost} сом</Text>}
        {note ? <Text style={styles.cardText}>Комментарий: {note}</Text> : null}
        <Text style={styles.cardDate}>{createdLabel}</Text>
      </TouchableOpacity>
    );
  };

  return (
  <View style={styles.container}>
      <Text style={styles.title}>История заказов</Text>
      {items.length === 0 ? (
        <Text style={styles.text}>Пока нет сохранённых заявок.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />)
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 14, color: '#555' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginTop: 10 },
  cardTitle: { fontWeight: '700', marginBottom: 4 },
  cardText: { color: '#333' },
  cardDate: { color: '#777', fontSize: 12, marginTop: 6 },
});
