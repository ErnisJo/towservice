import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Platform, Alert, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { on as onEvent, emit as emitEvent } from '../utils/eventBus';

function getApiBase() {
  const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
  if (/localhost|127\.0\.0\.1/.test(cfg) && Platform.OS !== 'web') {
    try {
      const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
      const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
      if (m) return `${m[1]}//${m[2]}:4001`;
    } catch {}
  }
  return cfg;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const wsRef = useRef(null);
  const tokenRef = useRef('');
  const uidRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const listRef = useRef(null);
  const atBottomRef = useRef(true);
  const base = getApiBase();
  const wsUrl = base.replace(/^http/, 'ws') + '/ws/user';

  const connectWs = () => {
    if (!tokenRef.current) return;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        try { ws.send(JSON.stringify({ token: tokenRef.current })); } catch {}
        reconnectAttemptsRef.current = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'message') {
            setMessages((prev) => {
              const d = msg.data;
              return prev.some((m) => m.id === d.id) ? prev : [...prev, d];
            });
            // Scroll to bottom if user is already near bottom
            try {
              if (atBottomRef.current && listRef.current && typeof listRef.current.scrollToEnd === 'function') {
                requestAnimationFrame(() => listRef.current && listRef.current.scrollToEnd({ animated: true }));
              }
            } catch {}
          }
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (!shouldReconnectRef.current) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current++), 10000);
        try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); } catch {}
        reconnectTimerRef.current = setTimeout(connectWs, delay);
      };
    } catch {}
  };

  useEffect(() => {
  let mounted = true;
  (async () => {
      try {
    // Use the same key as LoginScreen
    const token = await AsyncStorage.getItem('tow_token');
        tokenRef.current = token || '';
    if (!tokenRef.current) return;
        // Load history via /me to get userId then GET /users/{uid}/chat
        const meRes = await fetch(base + '/me', { headers: { Authorization: `Bearer ${tokenRef.current}` } });
        if (!meRes.ok) throw new Error('unauthorized');
        const me = await meRes.json();
        const uid = me?.user?.id;
        uidRef.current = uid || null;
    const histRes = await fetch(`${base}/users/${uid}/chat`);
    const hist = histRes.ok ? await histRes.json() : [];
        if (!mounted) return;
        setMessages(hist);
  // Ensure newest messages are visible on initial load
  try { setTimeout(() => { if (listRef.current?.scrollToEnd) listRef.current.scrollToEnd({ animated: false }); }, 0); } catch {}
        // Open WS with reconnect
        connectWs();
      } catch (e) {
        // ignore
      }
    })();
    // Listen auth changes to clear/reload chat
    const offAuth = onEvent('auth:changed', async (payload) => {
      try {
        const action = payload && payload.action;
        if (action === 'logout') {
          // Clear messages and close WS
          setMessages([]);
          shouldReconnectRef.current = false;
          try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); } catch {}
          try { wsRef.current && wsRef.current.close(); } catch {}
          tokenRef.current = '';
          uidRef.current = null;
        }
        if (action === 'login') {
          // Reload messages for new user
          try { shouldReconnectRef.current = true; } catch {}
          try { tokenRef.current = await AsyncStorage.getItem('tow_token') || ''; } catch {}
          setMessages([]);
          // reload history
          try {
            if (tokenRef.current) {
              const meRes = await fetch(base + '/me', { headers: { Authorization: `Bearer ${tokenRef.current}` } });
              if (meRes.ok) {
                const me = await meRes.json(); const uid = me?.user?.id; uidRef.current = uid || null;
                const histRes = await fetch(`${base}/users/${uid}/chat`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
                if (histRes.ok) { const hist = await histRes.json(); setMessages(hist || []); }
              }
            }
          } catch (_) {}
          // reconnect WS
          try { if (wsRef.current) wsRef.current.close(); } catch {}
          connectWs();
        }
      } catch (_) {}
    });
    return () => {
      mounted = false;
      shouldReconnectRef.current = false;
      try { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); } catch {}
      try { wsRef.current && wsRef.current.close(); } catch {}
  try { offAuth && offAuth(); } catch {}
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ text })); return; } catch {}
    }
    try {
      let uid = uidRef.current;
      if (!uid) {
        const meRes = await fetch(base + '/me', { headers: { Authorization: `Bearer ${tokenRef.current}` } });
        if (!meRes.ok) return;
        const me = await meRes.json();
        uid = me?.user?.id;
        uidRef.current = uid || null;
      }
      if (!uid) return;
      await fetch(`${base}/users/${uid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` }, body: JSON.stringify({ text }) });
    } catch {}
  };

  const renderItem = ({ item }) => (
    <View style={[styles.msgRow, item.sender === 'user' ? styles.right : styles.left]}>
      <View style={[styles.msg, item.sender === 'user' ? styles.msgUser : styles.msgAdmin]}>
        <Text style={[styles.meta]}>{item.sender === 'user' ? 'Вы' : 'Админ'}</Text>
        <Text style={item.sender === 'user' ? styles.msgUserText : styles.msgAdminText}>{item.text}</Text>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
        ref={listRef}
        onLayout={() => {
          // On layout, if there are messages, jump to bottom once
          try { if (messages.length && listRef.current?.scrollToEnd) listRef.current.scrollToEnd({ animated: false }); } catch {}
        }}
        onContentSizeChange={() => {
          // Keep pinned to bottom if user hasn't scrolled up
          try { if (atBottomRef.current && listRef.current?.scrollToEnd) listRef.current.scrollToEnd({ animated: false }); } catch {}
        }}
        onScroll={(e) => {
          try {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent || {};
            const y = contentOffset?.y ?? 0;
            const h = layoutMeasurement?.height ?? 0;
            const ch = contentSize?.height ?? 0;
            const threshold = 60; // px
            atBottomRef.current = y + h >= ch - threshold;
          } catch { atBottomRef.current = true; }
        }}
        scrollEventThrottle={100}
      />
      <View style={styles.inputRow}>
        <TextInput value={input} onChangeText={setInput} placeholder="Сообщение" style={styles.input} />
        <TouchableOpacity onPress={send} style={styles.sendBtn}><Text style={styles.sendText}>Отпр.</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffffff', borderRadius: 12,elevation: 4, borderTopWidth: 1, borderTopColor: '#e7e7e7ff', shadowColor: '#545454ff', },
  msgRow: { width: '100%', marginVertical: 6, flexDirection: 'row' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  msg: { maxWidth: '78%', borderRadius: 12, padding: 10 },
  msgAdmin: {  backgroundColor: '#ffffffff', elevation: 2 , shadowColor: '#8b8b8bff'},
  msgAdminText: { color: '#3e3e3eff' },
  msgUser: { backgroundColor: '#ffffffff', elevation: 2, shadowColor: '#8b8b8bff', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  msgUserText: { color: '#3e3e3eff' },
  meta: { fontSize: 12, opacity: 0.8, marginBottom: 2 },
  time: { fontSize: 11, opacity: 0.6, marginTop: 4 },
  inputRow: { flexDirection: 'row', padding: 10, borderTopWidth: 0},
  input: { backgroundColor: '#ffffffff', flex: 1, borderWidth: 0, elevation: 2, shadowColor: '#8b8b8bff', borderRadius: 15, paddingHorizontal: 8, paddingVertical: 4 },
  sendBtn: { marginLeft: 8, backgroundColor: '#0091ffff',  elevation: 2, shadowColor: '#8b8b8bff',borderRadius: 15, paddingHorizontal: 12, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
});
