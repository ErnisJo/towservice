import React, { useEffect, useMemo, useRef } from 'react';
import { View, Platform } from 'react-native';
import Constants from 'expo-constants';

// WebView-based map powered by 2GIS Maps API
export default function Map2GIS({
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
    lat: Number.isFinite(center?.latitude) ? center.latitude : 42.8746,
    lon: Number.isFinite(center?.longitude) ? center.longitude : 74.5698,
    zoom: Number.isFinite(zoom) ? zoom : 14,
  });
  const { lat, lon, zoom: initialZoom } = initialCenterRef.current;

  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  const mapTiles = extra?.mapTiles || {};
  const dgisKey = mapTiles.apiKey || extra?.dgisApiKey || '';

  if (__DEV__) {
    console.log(`[Map2GIS] provider=2gis keyPresent=${!!dgisKey}`);
  }

  const config = useMemo(() => ({
    lat,
    lon,
    zoom: initialZoom,
    apiKey: dgisKey,
    userLat: userLocation?.latitude || null,
    userLon: userLocation?.longitude || null,
  }), [lat, lon, initialZoom, dgisKey, userLocation]);

  const html = useMemo(() => {
    const cfg = JSON.stringify(config);
    return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height:100%; width:100%; margin:0; padding:0; overflow:hidden; }
    
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
      margin-top: 8px;
    }
    
    /* Красивые маркеры */
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
      left: 50%;
      margin-left: -5.5px;
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
    
    .dg-attr { position:absolute; right:8px; bottom:8px; background:rgba(255,255,255,0.9); padding:4px 6px; border-radius:6px; font:12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color:#555; z-index:1000; pointer-events:none; }
  </style>
</head>
<body>
  <div id="map"></div>
  
  <!-- Контейнер с кнопками управления -->
  <div class="map-controls-container">
    <button class="control-btn" id="zoom-in" onclick="zoomIn()">+</button>
    <button class="control-btn" id="zoom-out" onclick="zoomOut()">−</button>
    <button class="control-btn recenter-btn" id="recenter-btn" onclick="recenterMap()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8"/>
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
      </svg>
    </button>
  </div>
  
  <script>
    const CONFIG = ${cfg};
    let map = null;
    let startMarker = null;
    let userMarker = null;
    let previewMarker = null;
    let destMarker = null;
    let routeLine = null;
    let startPoint = [CONFIG.lat, CONFIG.lon];
    let userSetStart = false;

    // Функции зума и центрирования
    function zoomIn() {
      if (map) {
        map.setZoom(Math.min(18, map.getZoom() + 1));
      }
    }
    
    function zoomOut() {
      if (map) {
        map.setZoom(Math.max(10, map.getZoom() - 1));
      }
    }
    
    function recenterMap() {
      if (map && CONFIG.userLat && CONFIG.userLon) {
        map.setView([CONFIG.userLat, CONFIG.userLon], map.getZoom(), { animate: true, duration: 0.5 });
      } else if (map) {
        // Если нет координат пользователя, центрируем на стартовую точку
        map.setView(startPoint, map.getZoom(), { animate: true, duration: 0.5 });
      }
    }

    function post(type, payload){
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      } catch (err) {
        console.error('postMessage failed', err);
      }
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

    function createMarkerElement(label, variant = 'start'){
      const root = document.createElement('div');
      root.className = 'ts-marker' + (variant ? ' ts-marker--' + variant : '');
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

    function init2GIS(){
      try {
        console.log('Initializing Leaflet with 2GIS tiles...');
        map = L.map('map', {
          zoomControl: false,
          attributionControl: false,
        }).setView([CONFIG.lat, CONFIG.lon], CONFIG.zoom);

        // 2GIS tiles - номера домов встроены в тайлы
        L.tileLayer('https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1', {
          maxZoom: 18,
          subdomains: ['0', '1', '2', '3'],
          attribution: '© 2GIS',
        }).addTo(map);

        // Start marker (blue gradient pin with A)
        const startIcon = L.divIcon({
          html: createMarkerElement('A', 'start').outerHTML,
          className: '',
          iconSize: [35, 43],
          iconAnchor: [17.5, 43],
        });
        startMarker = L.marker([CONFIG.lat, CONFIG.lon], { icon: startIcon }).addTo(map);

        // User location marker (pulsing blue dot)
        const userIcon = L.divIcon({
          html: createUserMarker().outerHTML,
          className: '',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        userMarker = L.marker([CONFIG.lat, CONFIG.lon], { icon: userIcon }).addTo(map);

        window.App = {
          setStart: function(LAT, LON, LOCK){
            try {
              startPoint = [LAT, LON];
              userSetStart = !!LOCK;
              if (startMarker) startMarker.setLatLng([LAT, LON]);
            } catch(_){}
          },
          setStartVisible: function(V){
            try {
              if (!V) {
                if (startMarker){ map.removeLayer(startMarker); startMarker = null; }
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
              const previewIcon = L.divIcon({
                html: createMarkerElement('B', 'preview').outerHTML,
                className: '',
                iconSize: [35, 43],
                iconAnchor: [17.5, 43],
              });
              previewMarker = L.marker([LAT, LON], { icon: previewIcon }).addTo(map);
            } catch(_){}
          },
          clearPreview: function(){
            try { if (previewMarker){ map.removeLayer(previewMarker); previewMarker = null; } } catch(_){}
          },
          setUserLocation: function(LAT, LON){
            try { if (userMarker) userMarker.setLatLng([LAT, LON]); } catch(_){}
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
                  if (routeLine){ map.removeLayer(routeLine); routeLine = null; }
                  routeLine = L.polyline(coords, { color:'#0a84ff', weight:4 }).addTo(map);
                  map.fitBounds(routeLine.getBounds(), { padding:[40,40] });
                  const dist = Math.round(route.distance);
                  const dur = Math.round(route.duration);
                  post('route', { distance: dist, distanceText: (dist / 1000).toFixed(1) + ' км', duration: dur, durationText: Math.max(1, Math.round(dur / 60)) + ' мин' });
                } catch(err) {
                  // Удаляем старый маршрут перед отрисовкой fallback
                  if (routeLine){ map.removeLayer(routeLine); routeLine = null; }
                  const coords2 = [ [s[0], s[1]], [LAT, LON] ];
                  routeLine = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map);
                  map.fitBounds(routeLine.getBounds(), { padding:[40,40] });
                  const d2 = haversine(s[0], s[1], LAT, LON);
                  const t2 = Math.round(d2 / (40 * 1000 / 3600));
                  post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
                }
              }).catch(function(){
                // Удаляем старый маршрут перед отрисовкой fallback
                if (routeLine){ map.removeLayer(routeLine); routeLine = null; }
                const s = startPoint || [CONFIG.lat, CONFIG.lon];
                const coords2 = [ [s[0], s[1]], [LAT, LON] ];
                routeLine = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map);
                map.fitBounds(routeLine.getBounds(), { padding:[40,40] });
                const d2 = haversine(s[0], s[1], LAT, LON);
                const t2 = Math.round(d2 / (40 * 1000 / 3600));
                post('route', { distance: Math.round(d2), distanceText: (d2 / 1000).toFixed(1) + ' км', duration: t2, durationText: Math.max(1, Math.round(t2 / 60)) + ' мин' });
              });
            } catch(_){}
          },
          clearDestination: function(){
            try {
              if (destMarker){ map.removeLayer(destMarker); destMarker = null; }
              if (routeLine){ map.removeLayer(routeLine); routeLine = null; }
            } catch(_){}
          },
          clearRouteOnly: function(){
            try { if (routeLine){ map.removeLayer(routeLine); routeLine = null; } } catch(_){}
          },
          clearAll: function(){
            try {
              if (previewMarker){ map.removeLayer(previewMarker); previewMarker = null; }
              if (destMarker){ map.removeLayer(destMarker); destMarker = null; }
              if (routeLine){ map.removeLayer(routeLine); routeLine = null; }
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
        console.error('2GIS init failed', err);
        post('error', { message: String(err && err.message || err) });
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
      console.log('Window loaded, initializing 2GIS...');
      init2GIS();
    };
  </script>
</body>
</html>`;
  }, [config]);

  const source = useMemo(() => ({ html }), [html]);

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
