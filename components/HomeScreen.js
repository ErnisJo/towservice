import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Alert, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

// Карта показывается только после получения геопозиции пользователя
export default function HomeScreen({ navigation }) {
  const mapRef = useRef(null);
  const watchRef = useRef(null);

  const [region, setRegion] = useState(null);
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [permissionStatus, setPermissionStatus] = useState('checking'); // 'checking' | 'granted' | 'prompt'
  const [canAskAgain, setCanAskAgain] = useState(true);

  const startLocationFlow = async () => {
    try {
      setLoading(true);
      setError(null);

      const last = await Location.getLastKnownPositionAsync();
      let latitude = last?.coords?.latitude;
      let longitude = last?.coords?.longitude;

      if (latitude == null || longitude == null) {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }

      const initialRegion = {
        latitude,
        longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      setCoords({ latitude, longitude });
      setRegion(initialRegion);

      // Подписка на обновления
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
        (update) => {
          const { latitude: lat, longitude: lng } = update.coords;
          setCoords({ latitude: lat, longitude: lng });
        }
      );
    } catch (e) {
      setError('Не удалось получить местоположение');
    } finally {
      setLoading(false);
    }
  };

  // При монтировании: проверяем текущее разрешение
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        setCanAskAgain(current.canAskAgain ?? true);
        if (current.status === 'granted') {
          setPermissionStatus('granted');
          startLocationFlow();
        } else {
          setPermissionStatus('prompt');
          setLoading(false);
        }
      } catch (_) {
        if (!mounted) return;
        setPermissionStatus('prompt');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  const onRequestPermission = async () => {
    try {
      const req = await Location.requestForegroundPermissionsAsync();
      setCanAskAgain(req.canAskAgain ?? true);
      if (req.status === 'granted') {
        setPermissionStatus('granted');
        startLocationFlow();
      } else if (!req.canAskAgain) {
        Alert.alert(
          'Нужен доступ к геолокации',
          'Откройте настройки и разрешите доступ к местоположению.',
          [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Открыть настройки', onPress: () => Linking.openSettings && Linking.openSettings() },
          ]
        );
      }
    } catch (_) {
      // ignore
    }
  };

  return (
    <View style={styles.container}>
      {permissionStatus !== 'granted' ? (
        <View style={styles.center}>
          <Text style={{ marginBottom: 8 }}>
            {permissionStatus === 'checking' ? 'Проверяем доступ к геопозиции…' : 'Требуется доступ к геопозиции'}
          </Text>
          {permissionStatus === 'prompt' && (
            <TouchableOpacity onPress={onRequestPermission} style={styles.permissionBtn} activeOpacity={0.85}>
              <Text style={{ color: '#111', fontWeight: '600' }}>Разрешить</Text>
            </TouchableOpacity>
          )}
          {permissionStatus === 'prompt' && !canAskAgain && (
            <TouchableOpacity onPress={() => Linking.openSettings && Linking.openSettings()} style={{ marginTop: 8 }}>
              <Text style={{ color: '#0a84ff', fontWeight: '600' }}>Открыть настройки</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : region ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          provider={PROVIDER_GOOGLE}
          mapType="standard"
          scrollEnabled
          zoomEnabled
          zoomControlEnabled={Platform.OS === 'android'}
          showsUserLocation
          followsUserLocation={false}
          showsMyLocationButton={Platform.OS === 'android'}
          showsBuildings
          showsIndoors
          showsTraffic={false}
          minZoomLevel={3}
          maxZoomLevel={20}
          mapPadding={Platform.OS === 'android' ? { bottom: 96, top: 0, left: 0, right: 0 } : undefined}
        >
          {coords && <Marker coordinate={coords} title="Вы здесь" />}
        </MapView>
      ) : (
        <View style={styles.center}>
          {loading ? <Text>Определяем местоположение…</Text> : <Text>{error || 'Не удалось определить местоположение'}</Text>}
        </View>
      )}

      {coords && (
        <TouchableOpacity
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion(
                {
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500
              );
            }
          }}
          style={styles.myLocationBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.myLocationText}>◎</Text>
        </TouchableOpacity>
      )}

      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Request')}
          activeOpacity={0.85}
          style={styles.ctaButton}
        >
          <Text style={styles.ctaButtonText}>Вызвать эвакуатор</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,1)',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    elevation: 3,
    zIndex: 10,
  },
  ctaButton: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f7d307',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    color: '#ffffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  myLocationBtn: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  myLocationText: { fontSize: 20 },
  permissionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
  },
});
