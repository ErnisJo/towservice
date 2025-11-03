import React from 'react';
import Constants from 'expo-constants';
import Map2GIS from './Map2GIS';
import MapTilerMap from './MapTilerMap';

// Provider selector: switches between 2GIS and MapTiler based on configuration
function MapViewProvider(props) {
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  const mapProvider = extra?.mapProvider || 'maptiler';
  
  if (mapProvider === '2gis') {
    return <Map2GIS {...props} />;
  }
  
  return <MapTilerMap {...props} />;
}

// Memoize для предотвращения ненужных ре-рендеров
export default React.memo(MapViewProvider, (prevProps, nextProps) => {
  // Функция для сравнения координат
  const coordsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return a === b;
    return a.latitude === b.latitude && a.longitude === b.longitude;
  };

  // Сравниваем только важные props
  return (
    coordsEqual(prevProps.center, nextProps.center) &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.destination === nextProps.destination &&
    prevProps.preview === nextProps.preview &&
    coordsEqual(prevProps.start, nextProps.start) &&
    prevProps.startIsManual === nextProps.startIsManual &&
    prevProps.startVisible === nextProps.startVisible &&
    coordsEqual(prevProps.userLocation, nextProps.userLocation) &&
    prevProps.recenterAt === nextProps.recenterAt &&
    coordsEqual(prevProps.recenterCoords, nextProps.recenterCoords) &&
    prevProps.resetAt === nextProps.resetAt &&
    prevProps.clearDestinationAt === nextProps.clearDestinationAt &&
    prevProps.clearRouteOnlyAt === nextProps.clearRouteOnlyAt
  );
});
