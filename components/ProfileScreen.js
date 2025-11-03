import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emit as emitEvent } from '../utils/eventBus';
import { getApiBase } from '../utils/apiBase';

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('tow_user');
        const parsed = raw ? JSON.parse(raw) : null;
        if (mounted) {
          setUser(parsed);
          setDisplayNameDraft(parsed?.name || parsed?.display_name || '');
        }
        const storedToken = await AsyncStorage.getItem('tow_token');
        if (mounted) setToken(storedToken || '');
      } catch {}
    })();
    const unsub = navigation.addListener('focus', async () => {
      try {
        const raw = await AsyncStorage.getItem('tow_user');
        const parsed = raw ? JSON.parse(raw) : null;
        setUser(parsed);
        setDisplayNameDraft(parsed?.name || parsed?.display_name || '');
        const freshToken = await AsyncStorage.getItem('tow_token');
        setToken(freshToken || '');
      } catch {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [navigation]);

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('tow_token');
      if (token) {
        try {
          await fetch(getApiBase() + '/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
          });
        } catch {}
      }
      await AsyncStorage.multiRemove(['tow_token', 'tow_user']);
  try { emitEvent('auth:changed', { user: null, token: null, action: 'logout' }); } catch {}
      setUser(null);
      setToken('');
      setEditing(false);
      setDisplayNameDraft('');
      try { navigation?.navigate?.('Вход'); } catch {}
      Alert.alert('Готово', 'Вы вышли из аккаунта');
    } catch {}
  };

  const preferredName = useMemo(() => {
    if (!user) return '';
    const candidates = [user.display_name, user.name, user.first_name, user.last_name, user.phone];
    const found = candidates.find((v) => typeof v === 'string' && v.trim()) || '';
    return found.trim();
  }, [user]);

  const startEdit = () => {
    setDisplayNameDraft(preferredName);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDisplayNameDraft(preferredName);
  };

  const saveDisplayName = async () => {
    const value = (displayNameDraft || '').trim();
    if (!token) {
      Alert.alert('Ошибка', 'Вы не авторизованы');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(getApiBase() + '/api/v1/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ display_name: value || null }),
      });
      if (!res.ok) throw new Error('save_failed');
      const updated = await res.json();
      const normalized = {
        ...updated,
        name: value || (updated?.display_name || updated?.first_name || updated?.last_name || updated?.phone || ''),
      };
      await AsyncStorage.setItem('tow_user', JSON.stringify(normalized));
      setUser(normalized);
  setDisplayNameDraft(value);
  setEditing(false);
      try { emitEvent('auth:changed', { user: normalized, token, action: 'profile:update' }); } catch {}
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить имя');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль</Text>
      {user ? (
        <View style={styles.card}>
          <Text style={styles.label}>Телефон</Text>
          <Text style={styles.value}>{user.phone || '—'}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Имя</Text>
          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                value={displayNameDraft}
                onChangeText={setDisplayNameDraft}
                placeholder="Ваше имя"
                style={styles.input}
                maxLength={60}
              />
              <View style={styles.editButtons}>
                <TouchableOpacity style={[styles.smallBtn, styles.firstBtn, styles.cancelBtn]} onPress={cancelEdit} disabled={saving}>
                  <Text style={styles.smallBtnText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, styles.saveBtn]} onPress={saveDisplayName} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Сохранить</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.value}>{preferredName || '—'}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
                <Text style={styles.editBtnText}>Изменить</Text>
              </TouchableOpacity>
            </View>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0a84ff' },
  editBtnText: { color: '#fff', fontWeight: '600' },
  btn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  editRow: { marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, marginTop: 4 },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  smallBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 },
  firstBtn: { marginLeft: 0 },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  cancelBtn: { backgroundColor: '#8e8e93' },
  saveBtn: { backgroundColor: '#0a84ff' },
});
