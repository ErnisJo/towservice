import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('tow_requests');
      const list = raw ? JSON.parse(raw) : [];
      setItems(list);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Обновлять список при каждом возвращении на экран
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.location || 'Без адреса'}</Text>
  {!!item.notes && <Text style={styles.cardText}>Комментарий: {item.notes}</Text>}
      <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString()}</Text>
    </View>
  );

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
