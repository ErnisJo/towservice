import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import { requestCode as authRequestCode, verifyAuth } from '../utils/auth';
import { emit as emitEvent } from '../utils/eventBus';

export default function RegisterScreen({ navigation }) {
  const route = useRoute();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(1);
  const [devHint, setDevHint] = useState('');
  const [loading, setLoading] = useState(false);

  // Prefill from Login if navigated here
  useEffect(() => {
    try {
      const params = (route && route.params) || {};
      const p = params.phone || '';
      const d = params.devCode || '';
      if (p) setPhone(String(p));
      if (d) { setDevHint(`Код (dev): ${d}`); setStep(2); }
    } catch {}
  }, [route && route.params]);

  const requestCode = async () => {
    const p = phone.trim();
    if (!p) { Alert.alert('Ошибка', 'Введите номер телефона'); return; }
    setLoading(true);
    try {
  const j = await authRequestCode(p);
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

  const verify = async () => {
    const p = phone.trim();
    const c = code.trim();
    if (!p || !c) { Alert.alert('Ошибка', 'Введите номер и код'); return; }
    setLoading(true);
    try {
      const j = await verifyAuth({ phone: p, code: c, name: name.trim() });
      if (j?.token) await AsyncStorage.setItem('tow_token', j.token);
      if (j?.user) await AsyncStorage.setItem('tow_user', JSON.stringify(j.user));
            try { emitEvent('auth:changed', { user: j?.user || null, token: j?.token || null, action: 'login' }); } catch {}
      try { navigation?.navigate?.('BridgeToHome'); } catch {}
      try { const { navigate } = require('../navigation/navigationRef'); navigate('Карта'); } catch {}
      Alert.alert('Готово', 'Аккаунт создан, вы вошли');
    } catch (e) {
      const msg = (e && e.message) || 'Неверный код';
      Alert.alert('Ошибка', msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Регистрация по телефону</Text>
      {step === 1 ? (
        <>
          <TextInput placeholder="Имя" value={name} onChangeText={setName} style={styles.input} />
          <TextInput placeholder="Номер телефона" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
          <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={requestCode} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Отправка…' : 'Получить код'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput placeholder="Код из SMS" value={code} onChangeText={setCode} keyboardType="number-pad" style={styles.input} />
          <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={verify} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Проверка…' : 'Завершить'}</Text>
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
