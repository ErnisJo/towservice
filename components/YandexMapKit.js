import React from 'react';
import YandexMap from './YandexMap';

// Stub: placeholder for native Yandex MapKit integration.
// For now, it delegates to the existing WebView map to keep behavior unchanged.
export default function YandexMapKit(props) {
  return <YandexMap {...props} />;
}
