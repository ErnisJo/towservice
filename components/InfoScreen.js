import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getApiBase } from '../utils/apiBase';

export default function InfoScreen() {
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState('Сервис вызова эвакуатора.');
  const [version, setVersion] = useState('1.0');
  const [company, setCompany] = useState('Tow Service');

  useEffect(() => { setLoading(true); }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer = null;
      let inFlight = null;
      const run = async () => {
        try {
          const base = getApiBase();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          inFlight = controller;
          const res = await fetch(base + '/info?t=' + Date.now(), { cache: 'no-store', signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const j = await res.json();
            if (!cancelled) {
              if (j?.about) setAbout(j.about);
              if (j?.version) setVersion(j.version);
              if (j?.company) setCompany(j.company);
            }
          }
        } catch {}
        finally { if (!cancelled) setLoading(false); }
      };
      run();
      // Poll every 5s while focused
      timer = setInterval(run, 5000);
      return () => { cancelled = true; if (timer) clearInterval(timer); try { inFlight && inFlight.abort && inFlight.abort(); } catch(_){} };
    }, [])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Информация</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.text}>{about}</Text>
          <Text style={[styles.text, { marginTop: 8 }]}>Версия: {version}</Text>
          <Text style={[styles.text, { marginTop: 4 }]}>Компания: {company}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 14, color: '#555' },
});
