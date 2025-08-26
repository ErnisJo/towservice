import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function InfoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Информация</Text>
      <Text style={styles.text}>Сервис вызова эвакуатора. Версия 1.0. Контакты: support@example.com</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 14, color: '#555' },
});
