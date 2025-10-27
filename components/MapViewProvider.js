import React from 'react';
import Constants from 'expo-constants';
import YandexMap from './YandexMap';

// Wrapper that switches between Web (Yandex JS/OSM) and native MapKit when available
export default function MapViewProvider(props) {
  const provider = (Constants?.expoConfig?.extra?.mapProvider || 'web').toLowerCase();

  if (provider === 'mapkit') {
    try {
      const YandexMapKit = require('./YandexMapKit').default;
  return <YandexMapKit {...props} />;
    } catch (e) {
      // Fallback to web if MapKit not available (e.g., Expo Go)
    return <YandexMap {...props} />;
    }
  }
  return <YandexMap {...props} />;
  return <YandexMap {...props} />;
}
