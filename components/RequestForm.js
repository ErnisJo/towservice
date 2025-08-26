import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export default function RequestForm() {
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);

  async function fillAddressFromMap() {
    try {
      setGeoLoading(true);
      // Единый поток получения разрешения с предложением открыть настройки
      const current = await Location.getForegroundPermissionsAsync();
      let granted = current.status === 'granted';
      if (!granted) {
        const req = await Location.requestForegroundPermissionsAsync();
        granted = req.status === 'granted';
      }
      if (!granted) {
        Alert.alert(
          'Нет доступа',
          'Разрешите доступ к геолокации в настройках, чтобы подставить адрес.',
          [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Открыть настройки', onPress: () => Linking.openSettings && Linking.openSettings() },
          ]
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results && results.length > 0) {
        const addr = results[0];
        // Сборка адреса: улица, номер дома, город/нас.пункт, регион
        const parts = [
          [addr.street, addr.name].filter(Boolean).join(' '),
          addr.city || addr.subregion || addr.district,
          addr.region,
        ].filter(Boolean);
        const pretty = parts.join(', ');
        setLocation(pretty || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      } else {
        setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось определить адрес по геолокации');
    } finally {
      setGeoLoading(false);
    }
  }

  async function submit() {
    try {
      const loc = location.trim();
      if (!loc || loc.length < 3) {
        Alert.alert('Ошибка', 'Укажите адрес (минимум 3 символа)');
        return;
      }
      const payload = {
        id: Date.now().toString(),
        location: loc,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
      };
      const key = 'tow_requests';
      const existing = await AsyncStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      // добавляем новую заявку первым элементом
      const next = [payload, ...list];
      await AsyncStorage.setItem(key, JSON.stringify(next));
      setLocation('');
      setNotes('');
      Alert.alert('Успех', 'Заявка сохранена в истории');
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить заявку');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Адрес</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          value={location}
          onChangeText={setLocation}
          placeholder="Где вы находитесь"
        />
        <TouchableOpacity style={styles.mapBtn} onPress={fillAddressFromMap} disabled={geoLoading}>
          {geoLoading ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.mapBtnText}>По карте</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Комментарий</Text>
      <TextInput style={[styles.input, { height: 100 }]} value={notes} onChangeText={setNotes} placeholder="Необязательно" multiline />

      <TouchableOpacity onPress={submit} style={styles.button}>
        <Text style={styles.buttonText}>Отправить заявку</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { 
    borderRadius: 6, borderWidth: 1, borderColor: '#f0f0f0ff', backgroundColor: '#fff', paddingHorizontal: 12,
    padding: 5, 
  },
  inputFlex: { flex: 1 },
  mapBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#ffd60a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffd60a',
  },
  mapBtnText: { fontWeight: '700', color: '#ffffffff' },
  button: {
    backgroundColor: '#f7d307',
    paddingVertical: 20,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 20,
    
  },
  buttonText: { fontSize: 18, color: '#fff', fontWeight: '600', textShadowColor: '#cdcbcbff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1 },
});
