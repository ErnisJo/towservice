import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, Platform, NativeModules, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import { emit as emitEvent } from '../utils/eventBus';

export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

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
    try {
      const raw = await AsyncStorage.getItem('tow_user');
      const parsed = raw ? JSON.parse(raw) : null;
      setUser(parsed);
      setDisplayNameDraft(parsed?.name || parsed?.display_name || '');
      const storedToken = await AsyncStorage.getItem('tow_token');
      setToken(storedToken || '');
    } catch {}
  })(); }, []);

  // Refresh user state whenever the screen gains focus (handles re-login elsewhere)
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('tow_user');
          if (active) setUser(raw ? JSON.parse(raw) : null);
          if (active) {
            const parsed = raw ? JSON.parse(raw) : null;
            setDisplayNameDraft(parsed?.name || parsed?.display_name || '');
          }
          if (active) {
            const freshToken = await AsyncStorage.getItem('tow_token');
            setToken(freshToken || '');
          }
        } catch {}
      })();
      return () => { active = false; };
    }, [])
  );

  const preferredName = useMemo(() => {
    if (!user) return '';
    const candidates = [user.display_name, user.name, user.first_name, user.last_name, user.phone];
    const found = candidates.find((v) => typeof v === 'string' && v.trim()) || '';
    return found.trim();
  }, [user]);

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
      try { const { navigate } = require('../navigation/navigationRef'); navigate('Вход'); } catch {}
      Alert.alert('Готово', 'Вы вышли из аккаунта');
    } catch {}
  };

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
      <Text style={styles.title}>Настройки</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Аккаунт</Text>
        {user ? (
          <>
            <Text style={styles.text}>Телефон: {user.phone || '—'}</Text>
            <Text style={styles.text}>Имя:</Text>
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
                <Text style={styles.textValue}>{preferredName || '—'}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
                  <Text style={styles.editBtnText}>Изменить</Text>
                </TouchableOpacity>
              </View>
            )}
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
  textValue: { fontSize: 14, color: '#111', marginBottom: 4, flex: 1 },
  btn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontWeight: '700' },
  editRow: { marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, marginTop: 4 },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  smallBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 },
  firstBtn: { marginLeft: 0 },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  cancelBtn: { backgroundColor: '#8e8e93' },
  saveBtn: { backgroundColor: '#0a84ff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0a84ff' },
  editBtnText: { color: '#fff', fontWeight: '600' },
});
