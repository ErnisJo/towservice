import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emit as emitEvent } from '../utils/eventBus';
import { getApiBase } from '../utils/apiBase';

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('tow_user');
        if (mounted) setUser(raw ? JSON.parse(raw) : null);
      } catch {}
    })();
    const unsub = navigation.addListener('focus', async () => {
      try {
        const raw = await AsyncStorage.getItem('tow_user');
        setUser(raw ? JSON.parse(raw) : null);
      } catch {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [navigation]);

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('tow_token');
      if (token) {
        try { await fetch(getApiBase() + '/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }) } catch {}
      }
      await AsyncStorage.multiRemove(['tow_token', 'tow_user']);
  try { emitEvent('auth:changed', { user: null, token: null, action: 'logout' }); } catch {}
      setUser(null);
      try { navigation?.navigate?.('Вход'); } catch {}
      Alert.alert('Готово', 'Вы вышли из аккаунта');
    } catch {}
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль</Text>
      {user ? (
        <View style={styles.card}>
          <Text style={styles.label}>Телефон</Text>
          <Text style={styles.value}>{user.phone || '—'}</Text>
          {!!user.name && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Имя</Text>
              <Text style={styles.value}>{user.name}</Text>
            </>
          )}
          <TouchableOpacity style={[styles.btn, { marginTop: 16, backgroundColor: '#ff3b30' }]} onPress={logout}>
            <Text style={styles.btnText}>Выйти</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={{ color:'#444', marginBottom: 12 }}>Вы не вошли в аккаунт.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Вход')}>
            <Text style={styles.btnText}>Войти</Text>
          </TouchableOpacity>
        </View>
      )}

  {/* Removed “Перейти в настройки” button per request */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  label: { fontSize: 13, color: '#666' },
  value: { fontSize: 16, color: '#111', marginTop: 2 },
  btn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
});
