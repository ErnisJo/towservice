import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';

export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [user, setUser] = useState(null);

  const getApiBase = useCallback(() => {
    const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
    if (/localhost|127\.0\.0\.1/.test(cfg) && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:4001`;
      } catch {}
    }
    return cfg;
  }, []);

  useEffect(() => { (async () => {
    try { const raw = await AsyncStorage.getItem('tow_user'); setUser(raw ? JSON.parse(raw) : null) } catch {}
  })(); }, []);

  // Refresh user state whenever the screen gains focus (handles re-login elsewhere)
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('tow_user');
          if (active) setUser(raw ? JSON.parse(raw) : null);
        } catch {}
      })();
      return () => { active = false; };
    }, [])
  );

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('tow_token');
      if (token) {
        try { await fetch(getApiBase() + '/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }) } catch {}
      }
      await AsyncStorage.multiRemove(['tow_token', 'tow_user']);
  try { emitEvent('auth:changed', { user: null, token: null, action: 'logout' }); } catch {}
      setUser(null);
      try { const { navigate } = require('../navigation/navigationRef'); navigate('Вход'); } catch {}
      Alert.alert('Готово', 'Вы вышли из аккаунта');
    } catch {}
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Настройки</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Аккаунт</Text>
        {user ? (
          <>
            <Text style={styles.text}>Телефон: {user.phone || '—'}</Text>
            {!!user.name && <Text style={styles.text}>Имя: {user.name}</Text>}
            <TouchableOpacity onPress={logout} style={[styles.btn, { marginTop: 8, backgroundColor:'#ff3b30' }]}><Text style={styles.btnText}>Выйти</Text></TouchableOpacity>
          </>
        ) : (
          <Text style={styles.text}>Вы не вошли</Text>
        )}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Уведомления</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, backgroundColor: '#fff', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  label: { fontSize: 16 },
  text: { fontSize: 14, color: '#111', marginBottom: 4 },
  btn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontWeight: '700' },
});
