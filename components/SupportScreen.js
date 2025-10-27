import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity, ActivityIndicator, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import ChatScreen from './ChatScreen';

export default function SupportScreen() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('support@example.com');

  useEffect(() => { setLoading(true); }, []);

  const getApiBase = () => {
    const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
    if (/localhost|127\.0\.0\.1/.test(cfg) && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:4001`;
      } catch {}
    }
    return cfg;
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer = null;
      const run = async () => {
        try {
          const base = getApiBase();
          const res = await fetch(base + '/support?t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) {
              if (j?.email) setEmail(j.email);
            }
          }
        } catch {}
        finally { if (!cancelled) setLoading(false); }
      };
      run();
      // Poll every 5s while screen is focused
      timer = setInterval(run, 5000);
      return () => { cancelled = true; if (timer) clearInterval(timer); };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Служба поддержки</Text>
  <Text style={styles.text}>Если у вас есть вопросы, напишите нам на email или в чат ниже:</Text>
      {loading ? <ActivityIndicator /> : (
        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${email}`)} style={styles.btn}>
          <Text style={styles.btnText}>Email: {email}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1, alignSelf: 'stretch', marginTop: 12 }}>
        <ChatScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 14, color: '#555', marginBottom: 12 },
  btn: { backgroundColor: '#0a84ff', padding: 12, borderRadius: 10, marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  btnOutline: { borderColor: '#0a84ff', borderWidth: 1.5, padding: 12, borderRadius: 10, marginTop: 8 },
  btnOutlineText: { color: '#0a84ff', fontWeight: '700', textAlign: 'center' },
});
