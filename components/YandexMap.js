import React from 'react';
import MapTilerMap from './MapTilerMap';

// Backwards-compatible alias: keep `YandexMap` export so existing imports don't break.
export default function YandexMap(props) {
  return <MapTilerMap {...props} />;
}
