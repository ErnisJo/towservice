import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestCode as authRequestCode, verifyAuth } from '../utils/auth';
import { useFocusEffect } from '@react-navigation/native';
import { emit as emitEvent } from '../utils/eventBus';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1); // 1: phone, 2: code
  const [devHint, setDevHint] = useState('');
  const [loading, setLoading] = useState(false);

  const getApiBase = useCallback(() => require('../utils/apiBase').getApiBase(), []);

  // When screen is focused (e.g., after logout navigation), reset to phone entry step
  useFocusEffect(
    React.useCallback(() => {
      setStep(1);
      setCode('');
      setDevHint('');
      // optional: clear phone to avoid stale value after logout
      setPhone('');
      return () => {};
    }, [])
  );

  // Универсальный fetch с таймаутом
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);
    try {
      const res = await fetch(url, { ...(options || {}), signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  const requestCode = async () => {
    const p = phone.trim();
    if (!p) { Alert.alert('Ошибка', 'Введите номер телефона'); return; }
    setLoading(true);
    try {
      const j = await authRequestCode(p);
      if (j && j.userExists === false) {
        try {
          const { navigate } = require('../navigation/navigationRef');
          navigate('Регистрация', { phone: p, devCode: j?.devCode || null });
          return;
        } catch {}
      }
      if (j?.devCode) {
        const hint = `Код (dev): ${j.devCode}`;
        setDevHint(hint);
        try { Alert.alert('Код отправлен', `Ваш код: ${j.devCode}`); } catch {}
      }
      setStep(2);
    } catch (_) {
      Alert.alert('Ошибка', 'Не удалось отправить код');
    } finally { setLoading(false); }
  };

  const verifyCode = async () => {
    const p = phone.trim();
    const c = code.trim();
    if (!p || !c) { Alert.alert('Ошибка', 'Введите все поля'); return; }
    setLoading(true);
    try {
      const j = await verifyAuth({ phone: p, code: c });
      if (j?.token) await AsyncStorage.setItem('tow_token', j.token);
      if (j?.user) await AsyncStorage.setItem('tow_user', JSON.stringify(j.user));
  // Notify globally
  try { emitEvent('auth:changed', { user: j?.user || null, token: j?.token || null, action: 'login' }); } catch {}
      // Return to main app
      try { navigation?.navigate?.('BridgeToHome'); } catch {}
      try { const { navigate } = require('../navigation/navigationRef'); navigate('Карта'); } catch {}
      Alert.alert('Готово', 'Вы вошли в аккаунт');
    } catch (e) {
      const msg = (e && e.message) || 'Неверный код';
      Alert.alert('Ошибка', msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Вход по телефону</Text>
      {step === 1 ? (
        <>
          <TextInput placeholder="Номер телефона" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
          <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={requestCode} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Отправка…' : 'Получить код'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput placeholder="Код из SMS" value={code} onChangeText={setCode} keyboardType="number-pad" style={styles.input} />
          <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={verifyCode} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Проверка…' : 'Войти'}</Text>
          </TouchableOpacity>
      {!!devHint && <Text style={{ color:'#888', marginTop:8 }}>{devHint}</Text>}
        </>
      )}
    {step === 1 && !!devHint && <Text style={{ color:'#888', marginTop:8 }}>{devHint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 12 },
  btn: { backgroundColor: '#0a84ff', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700' },
});
