import React, { useEffect, useMemo, useRef } from 'react';
import { View, Platform } from 'react-native';
import Constants from 'expo-constants';

// WebView-based map powered by MapTiler SDK with Leaflet fallback when WebGL is unavailable
export default function MapTilerMap({
  center,
  zoom = 14,
  destination,
  preview,
  start,
  startIsManual,
  startVisible = true,
  userLocation,
  recenterAt,
  recenterCoords,
  resetAt,
  clearDestinationAt,
  clearRouteOnlyAt,
  onRoute,
  onMapClick,
  onReady,
  onError,
}) {
  const { WebView: WebViewComp, error: webviewError } = useMemo(() => {
    try {
      const { WebView } = require('react-native-webview');
      return { WebView, error: null };
    } catch (error) {
      return { WebView: null, error };
    }
  }, []);

  useEffect(() => {
    if (webviewError && onError) onError(webviewError);
  }, [webviewError, onError]);

  if (!WebViewComp) {
    return <View style={{ flex: 1 }} />;
  }

  const webRef = useRef(null);
  const readyRef = useRef(false);
  const initialCenterRef = useRef({
    lat: Number.isFinite(center?.latitude) ? center.latitude : 55.751244,
    lon: Number.isFinite(center?.longitude) ? center.longitude : 37.618423,
    zoom: Number.isFinite(zoom) ? zoom : 14,
  });
  const { lat, lon, zoom: initialZoom } = initialCenterRef.current;

  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  const mapTiles = extra?.mapTiles || {};
  const maptilerKey = mapTiles.apiKey || extra?.maptilerApiKey || '';
  const mapLanguage = mapTiles.language || extra?.mapLanguage || 'ru';
  const mtProvider = mapTiles.provider || '';
  const mtStyleName = mapTiles.style || 'streets-v2';
  const mtEnabled = mtProvider === 'maptiler' && !!maptilerKey;
  const encodedStyle = encodeURIComponent(mtStyleName);
  const maptilerQueryParts = [`key=${maptilerKey}`];
  if (mapLanguage) {
    maptilerQueryParts.push(`language=${encodeURIComponent(mapLanguage)}`);
  }
  const maptilerQuery = maptilerQueryParts.join('&');
  const mtStyleUrl = mtEnabled
    ? `https://api.maptiler.com/maps/${encodedStyle}/style.json?${maptilerQuery}`
    : '';
  const rasterTileUrl = mtEnabled
    ? `https://api.maptiler.com/maps/${encodedStyle}/{z}/{x}/{y}.png?${maptilerQuery}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attrText = mtEnabled
    ? 'Map data © MapTiler; © OpenStreetMap contributors'
    : 'Map data © OpenStreetMap contributors';

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(
      `[MapTilerMap] provider=${mtProvider || 'none'} style=${mtStyleName} keyPresent=${!!maptilerKey}`,
    );
  }

  const config = useMemo(() => ({
    lat,
    lon,
    zoom: initialZoom,
    attrText,
    maptilerEnabled: mtEnabled,
    apiKey: maptilerKey,
    styleUrl: mtStyleUrl,
    rasterTileUrl,
    language: mapLanguage,
  }), [lat, lon, initialZoom, attrText, mtEnabled, maptilerKey, mtStyleUrl, rasterTileUrl, mapLanguage]);

  const html = useMemo(() => {
    const cfg = JSON.stringify(config);
    return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <link rel="stylesheet" href="https://cdn.maptiler.com/maptiler-sdk-js/v1.7.1/maptiler-sdk.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height:100%; margin:0; padding:0; }
    .mt-attr { position:absolute; left:8px; bottom:8px; background:rgba(255,255,255,0.9); padding:4px 6px; border-radius:6px; font:12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color:#555; z-index:5; }
    
    /* Скрываем дефолтные контролы */
    .maptiler-ctrl-top-right, .leaflet-control-zoom { display: none !important; }
    
    /* Контейнер для кнопок управления картой */
    .map-controls-container {
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: auto;
    }
    
    /* Единый стиль для всех кнопок */
    .control-btn {
      width: 44px;
      height: 44px;
      border-radius: 30px;
      background: #f2f6ff;
      border: 0.5px solid #cfe3ff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 24px;
      font-weight: 300;
      color: #0a84ff;
      user-select: none;
      outline: none !important;
      -webkit-tap-highlight-color: transparent;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      pointer-events: auto;
    }
    .control-btn:hover {
      background: #e8f2ff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      transform: scale(1.05);
      outline: none !important;
    }
    .control-btn:active {
      transform: scale(0.95);
      background: #d9ebff;
      outline: none !important;
    }
    .control-btn:focus {
      outline: none !important;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    
    /* Отступ для кнопки центрирования */
    .control-btn.recenter-btn {
      margin-top: 20px;
    }

    .ts-marker {
      position: relative;
      width: 35px;
      height: 43px;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ts-marker__badge {
      width: 27px;
      height: 27px;
      border-radius: 14px;
      background: linear-gradient(135deg, #4a68ff, #1c4dff);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 5px 13px rgba(26, 79, 255, 0.35);
      border: 2px solid #fff;
    }
    .ts-marker__tail {
      position: absolute;
      bottom: 3px;
      width: 11px;
      height: 11px;
      transform: rotate(45deg);
      border-radius: 2px;
      background: linear-gradient(135deg, #4a68ff, #1c4dff);
      border: 2px solid #fff;
      box-shadow: 0 3px 8px rgba(26, 79, 255, 0.28);
    }
    .ts-marker--dest .ts-marker__badge,
    .ts-marker--dest .ts-marker__tail {
      background: linear-gradient(135deg, #222, #000);
      box-shadow: 0 5px 13px rgba(0, 0, 0, 0.35);
    }
    .ts-marker--preview .ts-marker__badge,
    .ts-marker--preview .ts-marker__tail {
      background: linear-gradient(135deg, #ff8a4d, #ff4f4d);
      box-shadow: 0 5px 13px rgba(255, 104, 80, 0.4);
    }
    .ts-marker__tail {
      left: 50%;
      margin-left: -5.5px;
    }

    .ts-user-marker {
      position: relative;
      width: 42px;
      height: 42px;
      pointer-events: none;
    }
    .ts-user-marker__pulse {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 42px;
      height: 42px;
      margin: -21px;
      border-radius: 50%;
      background: rgba(26, 115, 255, 0.18);
      animation: tsUserPulse 2.8s ease-out infinite;
    }
    .ts-user-marker__dot {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 18px;
      height: 18px;
      margin: -9px;
      border-radius: 50%;
      background: #1a73ff;
      border: 4px solid #fff;
      box-shadow: 0 6px 16px rgba(26, 115, 255, 0.35);
    }
    @keyframes tsUserPulse {
      0% { transform: scale(0.45); opacity: 0.9; }
      70% { transform: scale(1); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }
  </style>
  <script src="https://cdn.maptiler.com/maptiler-sdk-js/v1.7.1/maptiler-sdk.umd.min.js"></script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const CONFIG = ${cfg};
    function post(type, payload){
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      } catch (err) {
        console.error('postMessage failed', err);
      }
    }

    // Глобальные функции для кнопок управления
    let currentMap = null;
    let userLat = null;
    let userLon = null;
    
    function zoomIn() {
      if (currentMap) {
        const zoom = currentMap.getZoom ? currentMap.getZoom() : 14;
        if (currentMap.setZoom) {
          currentMap.setZoom(Math.min(18, zoom + 1));
        } else if (currentMap.zoomIn) {
          currentMap.zoomIn();
        }
      }
    }
    
    function zoomOut() {
      if (currentMap) {
        const zoom = currentMap.getZoom ? currentMap.getZoom() : 14;
        if (currentMap.setZoom) {
          currentMap.setZoom(Math.max(10, zoom - 1));
        } else if (currentMap.zoomOut) {
          currentMap.zoomOut();
        }
      }
    }
    
    function recenterMap() {
      if (!currentMap) return;
      const lat = userLat !== null ? userLat : CONFIG.lat;
      const lon = userLon !== null ? userLon : CONFIG.lon;
      if (currentMap.flyTo) {
        currentMap.flyTo({ center: [lon, lat], zoom: currentMap.getZoom() });
      } else if (currentMap.setView) {
        currentMap.setView([lat, lon], currentMap.getZoom(), { animate: true, duration: 0.5 });
      }
    }

    function createMarkerElement(label, variant){
      const root = document.createElement('div');
  root.className = 'ts-marker ts-marker--' + (variant || 'start');
      const badge = document.createElement('div');
      badge.className = 'ts-marker__badge';
      badge.textContent = label || '';
      const tail = document.createElement('div');
      tail.className = 'ts-marker__tail';
      root.appendChild(badge);
      root.appendChild(tail);
      return root;
    }

    function createUserMarker(){
      const root = document.createElement('div');
      root.className = 'ts-user-marker';
      const pulse = document.createElement('div');
      pulse.className = 'ts-user-marker__pulse';
      const dot = document.createElement('div');
      dot.className = 'ts-user-marker__dot';
      root.appendChild(pulse);
      root.appendChild(dot);
      return root;
    }

    function applyLanguagePreferences(mapInstance){
      if (!CONFIG.language) return;
      try {
        if (maptilersdk && maptilersdk.config) {
          if (typeof maptilersdk.config.primaryLanguage !== 'undefined') {
            maptilersdk.config.primaryLanguage = CONFIG.language;
          }
          if (typeof maptilersdk.config.language !== 'undefined') {
            maptilersdk.config.language = CONFIG.language;
          }
          if (typeof maptilersdk.config.mapLanguage !== 'undefined') {
            maptilersdk.config.mapLanguage = CONFIG.language;
          }
        }
      } catch (_) {}
      try {
        if (mapInstance && typeof mapInstance.setLanguage === 'function') {
          mapInstance.setLanguage(CONFIG.language);
        }
      } catch (_) {}
      try {
        if (mapInstance && typeof mapInstance.setNumberFormat === 'function') {
          mapInstance.setNumberFormat(CONFIG.language);
        }
      } catch (_) {}
    }

    function ensureHouseNumbers(mapInstance){
      try {
        const layers = [
          'building-number',
          'building-number-outline',
          'house-number',
          'house-number-outline',
          'address-house-number',
          'entrance-number',
        ];
        layers.forEach(function(layerId){
          if (mapInstance.getLayer && mapInstance.getLayer(layerId)) {
            mapInstance.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        });
      } catch (_) {}
    }

    function ensureStreetLabels(mapInstance){
      try {
        const layers = [
          'road-label',
          'road-label-major',
          'road-label-minor',
          'road-label-bridge',
          'road-label-local',
          'road-label-street',
          'street-label',
        ];
        layers.forEach(function(layerId){
          if (mapInstance.getLayer && mapInstance.getLayer(layerId)) {
            mapInstance.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        });
      } catch (_) {}
    }

    function haversine(lat1, lon1, lat2, lon2){
      const toRad = Math.PI / 180;
      const R = 6371000;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = (lon2 - lon1) * toRad;
      const sinLat = Math.sin(dLat / 2);
      const sinLon = Math.sin(dLon / 2);
      const a = sinLat * sinLat + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * sinLon * sinLon;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function initLeaflet(){
      try {
        const map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
          updateWhenIdle: false,
          updateWhenZooming: true,
          inertia: true,
          inertiaDeceleration: 3000,
        }).setView([CONFIG.lat, CONFIG.lon], CONFIG.zoom);
        currentMap = map; // Сохраняем ссылку для кнопок управления

        const tileUrl = CONFIG.rasterTileUrl && CONFIG.rasterTileUrl.includes('{z}')
          ? CONFIG.rasterTileUrl
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl, {
          maxZoom: 19,
          updateWhenIdle: false,
          keepBuffer: 4,
          updateInterval: 50,
          crossOrigin: true,
        }).addTo(map);

        let startPoint = [CONFIG.lat, CONFIG.lon];
        let userSetStart = false;
        const startIcon = L.divIcon({
          html: createMarkerElement('A', 'start').outerHTML,
          className: '',
          iconSize: [35, 43],
          iconAnchor: [17.5, 43],
        });
        let startMarker = L.marker([CONFIG.lat, CONFIG.lon], { icon: startIcon }).addTo(map);
        const userIcon = L.divIcon({
          html: createUserMarker().outerHTML,
          className: '',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        let userMarker = L.marker([CONFIG.lat, CONFIG.lon], { icon: userIcon, interactive: true }).addTo(map);
        let previewMarker = null;
        let destMarker = null;
        let line = null;

        window.App = {
          setStart: function(LAT, LON, LOCK){ try { startPoint = [LAT, LON]; userSetStart = !!LOCK; if (startMarker) startMarker.setLatLng([LAT, LON]); } catch(_){} },
          setStartVisible: function(V){
            try {
              if (!V) {
                if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
              } else {
                if (!startMarker) {
                  const startIcon = L.divIcon({
                    html: createMarkerElement('A', 'start').outerHTML,
                    className: '',
                    iconSize: [35, 43],
                    iconAnchor: [17.5, 43],
                  });
                  startMarker = L.marker(startPoint || [CONFIG.lat, CONFIG.lon], { icon: startIcon }).addTo(map);
                }
              }
            } catch(_){}
          },
          setCenter: function(LAT, LON){
            try {
              map.setView([LAT, LON], map.getZoom(), { animate: true });
              if (!userSetStart) {
                startPoint = [LAT, LON];
                if (startMarker) startMarker.setLatLng([LAT, LON]);
              }
            } catch(_){}
          },
          setPreview: function(LAT, LON){
            try {
              if (previewMarker){ map.removeLayer(previewMarker); previewMarker = null; }
              const prevIcon = L.divIcon({
                html: createMarkerElement('B', 'preview').outerHTML,
                className: '',
                iconSize: [35, 43],
                iconAnchor: [17.5, 43],
              });
              previewMarker = L.marker([LAT, LON], { icon: prevIcon, opacity: 0.95 }).addTo(map);
            } catch(_){}
          },
          clearPreview: function(){ try { if (previewMarker){ map.removeLayer(previewMarker); previewMarker = null; } } catch(_){} },
          setUserLocation: function(LAT, LON){ 
            try { 
              userLat = LAT; 
              userLon = LON; 
              if (userMarker) userMarker.setLatLng([LAT, LON]); 
            } catch(_){} 
          },
          setDestination: function(LAT, LON){
            try {
              if (destMarker){ map.removeLayer(destMarker); destMarker = null; }
              // НЕ удаляем старый маршрут здесь - удалим после построения нового
              const destIcon = L.divIcon({
                html: createMarkerElement('B', 'dest').outerHTML,
                className: '',
                iconSize: [35, 43],
                iconAnchor: [17.5, 43],
              });
              destMarker = L.marker([LAT, LON], { icon: destIcon }).addTo(map);
              const s = startPoint || [CONFIG.lat, CONFIG.lon];
              const url = 'https://router.project-osrm.org/route/v1/driving/' + (s[1]) + ',' + (s[0]) + ';' + (LON) + ',' + (LAT) + '?overview=full&geometries=geojson&alternatives=false&annotations=duration,distance';
              fetch(url).then(r => r.json()).then(function(j){
                try {
                  if (!j || !j.routes || !j.routes[0]) throw new Error('no-route');
                  const route = j.routes[0];
                  const coords = route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; });
                  // Удаляем старый маршрут только перед отрисовкой нового
                  if (line){ map.removeLayer(line); line = null; }
                  line = L.polyline(coords, { color:'#0a84ff', weight:4 }).addTo(map);
                  map.fitBounds(line.getBounds(), { padding:[40,40] });
                  const dist = Math.round(route.distance);
                  const dur = Math.round(route.duration);
                  post('route', { distance: dist, distanceText: (dist / 1000).toFixed(1) + ' км', duration: dur, durationText: Math.max(1, Math.round(dur / 60)) + ' мин' });
                } catch(err) {
                  // Удаляем старый маршрут перед отрисовкой fallback
                  if (line){ map.removeLayer(line); line = null; }
                  const coords2 = [ [s[0], s[1]], [LAT, LON] ];
                  line = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map);
                  map.fitBounds(line.getBounds(), { padding:[40,40] });
                  const d2 = haversine(s[0], s[1], LAT, LON);
                  const t2 = Math.round(d2 / (40 * 1000 / 3600));
                  post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
                }
              }).catch(function(){
                // Удаляем старый маршрут перед отрисовкой fallback
                if (line){ map.removeLayer(line); line = null; }
                const s = startPoint || [CONFIG.lat, CONFIG.lon];
                const coords2 = [ [s[0], s[1]], [LAT, LON] ];
                line = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map);
                map.fitBounds(line.getBounds(), { padding:[40,40] });
                const d2 = haversine(s[0], s[1], LAT, LON);
                const t2 = Math.round(d2 / (40 * 1000 / 3600));
                post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
              });
            } catch(_){}
          },
          clearDestination: function(){ try { if (destMarker){ map.removeLayer(destMarker); destMarker = null; } if (line){ map.removeLayer(line); line = null; } } catch(_){} },
          clearRouteOnly: function(){ try { if (line){ map.removeLayer(line); line = null; } } catch(_){} },
          clearAll: function(){
            try {
              if (previewMarker){ map.removeLayer(previewMarker); previewMarker = null; }
              if (destMarker){ map.removeLayer(destMarker); destMarker = null; }
              if (line){ map.removeLayer(line); line = null; }
              userSetStart = false;
              startPoint = [CONFIG.lat, CONFIG.lon];
              if (startMarker){ startMarker.setLatLng([CONFIG.lat, CONFIG.lon]); }
            } catch(_){}
          }
        };

        map.on('click', function(e){
          try {
            const c = e.latlng;
            post('mapClick', { latitude: c.lat, longitude: c.lng, address: null });
          } catch(err){}
        });

        post('ready', {});
      } catch (err) {
        console.error('Leaflet init failed', err);
        post('error', { message: String(err && err.message || err) });
      }
    }

    function initMapTiler(){
      try {
        if (!maptilersdk || !CONFIG.apiKey || !CONFIG.styleUrl) {
          initLeaflet();
          return;
        }
        maptilersdk.config.apiKey = CONFIG.apiKey;
        applyLanguagePreferences(null);
        const map = new maptilersdk.Map({
          container: 'map',
          style: CONFIG.styleUrl,
          center: [CONFIG.lon, CONFIG.lat],
          zoom: CONFIG.zoom,
        });
        currentMap = map; // Сохраняем ссылку для кнопок управления
        map.addControl(new maptilersdk.NavigationControl({ showCompass: false }), 'top-right');
        applyLanguagePreferences(map);
        ensureHouseNumbers(map);
        ensureStreetLabels(map);

        let startPoint = [CONFIG.lat, CONFIG.lon];
        let userSetStart = false;
  let startMarker = new maptilersdk.Marker({ element: createMarkerElement('A', 'start'), anchor: 'bottom' }).setLngLat([CONFIG.lon, CONFIG.lat]).addTo(map);
  let userMarker = new maptilersdk.Marker({ element: createUserMarker(), anchor: 'center' }).setLngLat([CONFIG.lon, CONFIG.lat]).addTo(map);
        let previewMarker = null;
        let destMarker = null;
        const routeSourceId = 'route-src';
        const routeLayerId = 'route-line';

        function ensureRouteSource(){
          try {
            if (!map.getSource(routeSourceId)) {
              map.addSource(routeSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            }
            if (!map.getLayer(routeLayerId)) {
              map.addLayer({
                id: routeLayerId,
                type: 'line',
                source: routeSourceId,
                paint: { 'line-color': '#0a84ff', 'line-width': 4 },
              });
            }
          } catch (err) {
            console.error('ensureRouteSource failed', err);
          }
        }

        window.App = {
          setStart: function(LAT, LON, LOCK){
            try {
              startPoint = [LAT, LON];
              userSetStart = !!LOCK;
              if (startMarker) startMarker.setLngLat([LON, LAT]);
            } catch(err){}
          },
          setStartVisible: function(V){
            try {
              if (!V) {
                if (startMarker){ startMarker.remove(); startMarker = null; }
              } else {
                if (!startMarker) {
                  startMarker = new maptilersdk.Marker({ element: createMarkerElement('A', 'start'), anchor: 'bottom' }).setLngLat([ (startPoint ? startPoint[1] : CONFIG.lon), (startPoint ? startPoint[0] : CONFIG.lat) ]).addTo(map);
                }
              }
            } catch(err){}
          },
          setCenter: function(LAT, LON){
            try {
              map.easeTo({ center: [LON, LAT], duration: 500 });
              if (!userSetStart) {
                startPoint = [LAT, LON];
                if (startMarker) startMarker.setLngLat([LON, LAT]);
              }
            } catch(err){}
          },
          setPreview: function(LAT, LON){
            try {
              if (previewMarker){ previewMarker.remove(); previewMarker = null; }
              previewMarker = new maptilersdk.Marker({ element: createMarkerElement('B', 'preview'), anchor: 'bottom' }).setLngLat([LON, LAT]).addTo(map);
            } catch(err){}
          },
          clearPreview: function(){ try { if (previewMarker){ previewMarker.remove(); previewMarker = null; } } catch(err){} },
          setUserLocation: function(LAT, LON){ 
            try { 
              userLat = LAT; 
              userLon = LON; 
              if (userMarker) userMarker.setLngLat([LON, LAT]); 
            } catch(err){} 
          },
          setDestination: function(LAT, LON){
            try {
              ensureRouteSource();
              if (destMarker){ destMarker.remove(); destMarker = null; }
              destMarker = new maptilersdk.Marker({ element: createMarkerElement('B', 'dest'), anchor: 'bottom' }).setLngLat([LON, LAT]).addTo(map);
              const s = startPoint || [CONFIG.lat, CONFIG.lon];
              const url = 'https://router.project-osrm.org/route/v1/driving/' + (s[1]) + ',' + (s[0]) + ';' + (LON) + ',' + (LAT) + '?overview=full&geometries=geojson&alternatives=false&annotations=duration,distance';
              fetch(url).then(r => r.json()).then(function(j){
                try {
                  if (!j || !j.routes || !j.routes[0]) throw new Error('no-route');
                  const route = j.routes[0];
                  const gj = { type: 'FeatureCollection', features: [ { type: 'Feature', geometry: route.geometry, properties: {} } ] };
                  map.getSource(routeSourceId).setData(gj);
                  const coords = route.geometry.coordinates;
                  let minX = coords[0][0], minY = coords[0][1], maxX = minX, maxY = minY;
                  coords.forEach(function(c){ minX = Math.min(minX, c[0]); minY = Math.min(minY, c[1]); maxX = Math.max(maxX, c[0]); maxY = Math.max(maxY, c[1]); });
                  map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 500 });
                  const dist = Math.round(route.distance);
                  const dur = Math.round(route.duration);
                  post('route', { distance: dist, distanceText: (dist / 1000).toFixed(1) + ' км', duration: dur, durationText: Math.max(1, Math.round(dur / 60)) + ' мин' });
                } catch(err) {
                  const s = startPoint || [CONFIG.lat, CONFIG.lon];
                  const gj2 = { type: 'FeatureCollection', features: [ { type: 'Feature', geometry: { type: 'LineString', coordinates: [ [s[1], s[0]], [LON, LAT] ] }, properties: {} } ] };
                  map.getSource(routeSourceId).setData(gj2);
                  const d2 = haversine(s[0], s[1], LAT, LON);
                  const t2 = Math.round(d2 / (40 * 1000 / 3600));
                  map.fitBounds([[Math.min(s[1], LON), Math.min(s[0], LAT)], [Math.max(s[1], LON), Math.max(s[0], LAT)]], { padding: 40, duration: 500 });
                  post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
                }
              }).catch(function(){
                const s = startPoint || [CONFIG.lat, CONFIG.lon];
                const gj2 = { type: 'FeatureCollection', features: [ { type: 'Feature', geometry: { type: 'LineString', coordinates: [ [s[1], s[0]], [LON, LAT] ] }, properties: {} } ] };
                try { map.getSource(routeSourceId).setData(gj2); } catch(_) {}
                map.fitBounds([[Math.min(s[1], LON), Math.min(s[0], LAT)], [Math.max(s[1], LON), Math.max(s[0], LAT)]], { padding: 40, duration: 500 });
                const d2 = haversine(s[0], s[1], LAT, LON);
                const t2 = Math.round(d2 / (40 * 1000 / 3600));
                post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
              });
            } catch(err){}
          },
          clearDestination: function(){
            try {
              if (destMarker){ destMarker.remove(); destMarker = null; }
              if (map.getSource(routeSourceId)) {
                map.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] });
              }
            } catch(err){}
          },
          clearRouteOnly: function(){
            try {
              if (map.getSource(routeSourceId)) {
                map.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] });
              }
            } catch(err){}
          },
          clearAll: function(){
            try {
              if (previewMarker){ previewMarker.remove(); previewMarker = null; }
              if (destMarker){ destMarker.remove(); destMarker = null; }
              if (map.getSource(routeSourceId)) {
                map.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] });
              }
              userSetStart = false;
              startPoint = [CONFIG.lat, CONFIG.lon];
              if (startMarker){ startMarker.setLngLat([CONFIG.lon, CONFIG.lat]); }
            } catch(err){}
          },
        };

        map.on('load', function(){
          try { ensureRouteSource(); } catch(_){ }
          applyLanguagePreferences(map);
          ensureHouseNumbers(map);
          ensureStreetLabels(map);
          post('ready', {});
        });

        map.on('styledata', function(){
          applyLanguagePreferences(map);
          ensureHouseNumbers(map);
          ensureStreetLabels(map);
        });

        map.on('click', function(e){
          try {
            post('mapClick', { latitude: e.lngLat.lat, longitude: e.lngLat.lng, address: null });
          } catch(err){}
        });
      } catch (err) {
        console.error('MapTiler init failed', err);
        post('error', { message: String(err && err.message || err) });
        initLeaflet();
      }
    }

    window.onerror = function(message, source, lineno, colno){
      post('error', { message: String(message), source, line: lineno, col: colno });
    };
    window.onunhandledrejection = function(e){
      const msg = (e && e.reason && e.reason.message) || String(e && e.reason || e);
      post('error', { message: msg });
    };

    window.onload = function(){
      if (CONFIG.maptilerEnabled && CONFIG.apiKey && CONFIG.styleUrl) {
        initMapTiler();
      } else {
        initLeaflet();
      }
    };
  </script>
</head>
<body>
  <div id="map" style="width:100%;height:100%"></div>
  <div class="mt-attr">${config.attrText}</div>
  
  <!-- Контейнер с кнопками управления -->
  <div class="map-controls-container">
    <button class="control-btn" id="zoom-in" onclick="zoomIn()">+</button>
    <button class="control-btn" id="zoom-out" onclick="zoomOut()">−</button>
    <button class="control-btn recenter-btn" id="recenter-btn" onclick="recenterMap()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8"/>
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
      </svg>
    </button>
  </div>
</body>
</html>`;
  }, [config]);

  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = center?.latitude;
    const lon2 = center?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try {
        webRef.current.injectJavaScript(`window.App && window.App.setCenter(${lat2}, ${lon2}); true;`);
      } catch (_) {}
    }
  }, [center?.latitude, center?.longitude]);

  const source = useMemo(() => ({ html }), [html]);

  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = start?.latitude;
    const lon2 = start?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try {
        webRef.current.injectJavaScript(`window.App && window.App.setStart && window.App.setStart(${lat2}, ${lon2}, ${startIsManual ? 'true' : 'false'}); true;`);
      } catch (_) {}
    }
  }, [start?.latitude, start?.longitude, startIsManual]);

  useEffect(() => {
    if (!webRef.current) return;
    try {
      webRef.current.injectJavaScript(`window.App && window.App.setStartVisible && window.App.setStartVisible(${startVisible ? 'true' : 'false'}); true;`);
    } catch (_) {}
  }, [startVisible]);

  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = userLocation?.latitude;
    const lon2 = userLocation?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try {
        webRef.current.injectJavaScript(`window.App && window.App.setUserLocation && window.App.setUserLocation(${lat2}, ${lon2}); true;`);
      } catch (_) {}
    }
  }, [userLocation?.latitude, userLocation?.longitude]);

  useEffect(() => {
    if (!webRef.current) return;
    if (preview && typeof preview.latitude === 'number' && typeof preview.longitude === 'number') {
      webRef.current.injectJavaScript(`window.App && window.App.setPreview(${preview.latitude}, ${preview.longitude}); true;`);
    } else {
      webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); true;');
    }
  }, [preview]);

  useEffect(() => {
    if (!webRef.current) return;
    if (destination && typeof destination.latitude === 'number' && typeof destination.longitude === 'number') {
      webRef.current.injectJavaScript(`window.App && window.App.setDestination(${destination.latitude}, ${destination.longitude}); true;`);
    } else {
      webRef.current.injectJavaScript('window.App && window.App.clearDestination && window.App.clearDestination(); true;');
    }
  }, [destination, recenterCoords]);

  useEffect(() => {
    if (!webRef.current || !recenterAt) return;
    const { latitude, longitude } = recenterCoords || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
    webRef.current.injectJavaScript(`window.App && window.App.setCenter(${latitude}, ${longitude}); true;`);
  }, [recenterAt, recenterCoords]);

  useEffect(() => {
    if (!webRef.current || !resetAt) return;
    webRef.current.injectJavaScript('window.App && window.App.clearAll && window.App.clearAll(); true;');
  }, [resetAt]);

  useEffect(() => {
    if (!webRef.current || !clearDestinationAt) return;
    try {
      webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); window.App && window.App.clearDestination && window.App.clearDestination(); true;');
    } catch (_) {}
  }, [clearDestinationAt]);

  useEffect(() => {
    if (!webRef.current || !clearRouteOnlyAt) return;
    try {
      webRef.current.injectJavaScript('window.App && window.App.clearRouteOnly && window.App.clearRouteOnly(); true;');
    } catch (_) {}
  }, [clearRouteOnlyAt]);

  return (
    <View style={{ flex: 1 }}>
      <WebViewComp
        ref={webRef}
        originWhitelist={["*"]}
        source={source}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        onMessage={(e) => {
          try {
            const { type, payload } = JSON.parse(e.nativeEvent.data || '{}');
            if (type === 'ready') {
              readyRef.current = true;
              try {
                webRef.current && webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); window.App && window.App.clearDestination && window.App.clearDestination(); true;');
              } catch (_) {}
              onReady && onReady();
            }
            if (type === 'error') { onError && onError(payload || {}); }
            if (type === 'mapClick') onMapClick && onMapClick(payload);
            if (type === 'route') onRoute && onRoute(payload);
          } catch (err) {
            console.error('onMessage parse failed', err);
          }
        }}
        onError={onError}
        onHttpError={onError}
        style={{ flex: 1 }}
        overScrollMode={Platform.OS === 'android' ? 'never' : 'auto'}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        androidHardwareAccelerationDisabled={false}
      />
    </View>
  );
}
