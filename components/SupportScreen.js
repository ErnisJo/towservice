import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';

export default function SupportScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Служба поддержки</Text>
      <Text style={styles.text}>Если у вас есть вопросы, свяжитесь с нами:</Text>
      <TouchableOpacity onPress={() => Linking.openURL('tel:+70000000000')} style={styles.btn}>
        <Text style={styles.btnText}>Позвонить: +7 000 000-00-00</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Linking.openURL('mailto:support@example.com')} style={styles.btnOutline}>
        <Text style={styles.btnOutlineText}>Написать: support@example.com</Text>
      </TouchableOpacity>
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
