import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Platform } from 'react-native';
import Constants from 'expo-constants';

// WebView-based map: MapLibre GL JS (OSM) when no apiKey; Yandex JS when apiKey provided
export default function YandexMap({ center, zoom = 14, destination, preview, start, startIsManual, startVisible = true, userLocation, recenterAt, recenterCoords, resetAt, clearDestinationAt, clearRouteOnlyAt, /* disableClicksAt, */ onRoute, onMapClick, onReady, onError, apiKey = '' }) {
  let WebViewComp = null;
  try {
    WebViewComp = require('react-native-webview').WebView;
  } catch (e) {
    useEffect(() => { onError && onError(e); }, []);
    return <View style={{ flex: 1 }} />;
  }

  const webRef = useRef(null);
  const readyRef = useRef(false);
  // Зафиксируем стартовый центр один раз, чтобы смена center не пересобирала HTML
  const initialCenterRef = useRef({
    lat: Number.isFinite(center?.latitude) ? center.latitude : 55.751244,
    lon: Number.isFinite(center?.longitude) ? center.longitude : 37.618423,
    zoom: Number.isFinite(zoom) ? zoom : 14,
  });
  const { lat, lon, zoom: initialZoom } = initialCenterRef.current;

  const html = useMemo(() => {
    const hasKey = !!apiKey;
    const yandexType = 'yandex#map';

    if (!hasKey) {
      // Prefer vector style (MapTiler) to control labels; fallback to raster OSM.
      const mapTiles = (Constants?.expoConfig?.extra?.mapTiles) || {};
      const mtEnabled = mapTiles.provider === 'maptiler' && !!mapTiles.apiKey;
      const mtStyleName = mapTiles.style || 'streets';
      const mtStyleUrl = mtEnabled ? `https://api.maptiler.com/maps/${mtStyleName}/style.json?key=${mapTiles.apiKey}` : '';
      const attrText = mtEnabled ? '© MapTiler • © OpenStreetMap contributors' : '© OpenStreetMap contributors';

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <link href="https://unpkg.com/maplibre-gl@3.5.2/dist/maplibre-gl.css" rel="stylesheet" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height:100%; margin:0; padding:0; }
  .osm-attr { position:absolute; left:8px; bottom:8px; background:rgba(255,255,255,0.9); padding:4px 6px; border-radius:6px; font:12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color:#555; z-index:5; }
  /* MapLibre zoom control styling */
  .maplibregl-ctrl-top-right .maplibregl-ctrl { margin: 12px 12px 0 0; }
  .maplibregl-ctrl-group {top: 120px; border: none; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.95); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  .maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out { width: 36px; height: 36px; color: #222; }
  .maplibregl-ctrl-zoom-in:hover, .maplibregl-ctrl-zoom-out:hover { background: none; color: #fff; }
  /* Leaflet zoom control styling and move to top-right */
  .leaflet-control-zoom {top: 120px;border: none; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  .leaflet-control-zoom a { background: rgba(255,255,255,0.95); color: #222; width: 36px; height: 36px; line-height: 36px; font-size: 18px; }
  .leaflet-control-zoom a:hover { background: #0a84ff; color: #fff; }
  .leaflet-top.leaflet-left { right: 12px; left: auto; top: 12px; }
  </style>
  <script src="https://unpkg.com/maplibre-gl@3.5.2/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
  function post(type, payload){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type, payload})); }
  window.onerror = function(message, source, lineno, colno, error){ try { post('error', { message: String(message), source, line: lineno, col: colno }); } catch(_){} };
  window.onunhandledrejection = function(e){ try { var msg=(e&&e.reason&&e.reason.message)||String(e&&e.reason||e); post('error', { message: msg }); } catch(_){} };
    function haversine(lat1, lon1, lat2, lon2){ var toRad = Math.PI/180, R=6371000; var dLat=(lat2-lat1)*toRad, dLon=(lon2-lon1)*toRad; var a=Math.sin(dLat/2)**2+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
  function initLeaflet(){
      try {
  // Leaflet: default zoom control has + and - only; ensure no additional slider is added
  var map = L.map('map', { zoomControl: true, attributionControl: false, updateWhenIdle: false, updateWhenZooming: true, inertia: true, inertiaDeceleration: 3000 }).setView([${lat}, ${lon}], ${initialZoom});
  try { map.setZoom(${initialZoom + 3}); } catch(_){}
  try { if (L.control && L.control.zoom) { /* default control already buttons-only */ } } catch(e){}
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, updateWhenIdle: false, keepBuffer: 4, updateInterval: 50, crossOrigin: true }).addTo(map);
  var startPoint = [${lat}, ${lon}];
        var userSetStart = false;
  // Simple dot icons (SVG circles)
  function mkDotSvg(color){ return '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="'+color+'"/></svg>'; }
  var startIcon = L.icon({ iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(mkDotSvg('#0a84ff')), iconSize: [30,30], iconAnchor: [15,15] });
  var currentMarker = L.marker([${lat}, ${lon}], { icon: startIcon }).addTo(map);
  var userIcon = L.icon({ iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(mkDotSvg('#1166ff')), iconSize: [30,30], iconAnchor: [15,15] });
  var userMarker = L.marker([${lat}, ${lon}], { icon: userIcon, interactive:true }).addTo(map);
  var previewMarker = null; var destMarker = null; var line = null;
        window.App = {
          // disableClicks removed per UX decision
          setStart: function(LAT, LON, LOCK){ try { startPoint=[LAT,LON]; userSetStart=!!LOCK; if (currentMarker) currentMarker.setLatLng([LAT,LON]); } catch(_){} },
          setStartVisible: function(V){ try { V=!!V; if (!V){ if (currentMarker){ map.removeLayer(currentMarker); currentMarker=null; } } else { if (!currentMarker){ currentMarker = L.marker(startPoint || [${lat}, ${lon}], { icon: startIcon }).addTo(map); } } } catch(_){} },
          setCenter: function(LAT, LON){ try { map.setView([LAT, LON], map.getZoom(), { animate:true }); if (!userSetStart){ startPoint=[LAT,LON]; if (currentMarker) currentMarker.setLatLng([LAT,LON]); } } catch(_){} },
          setPreview: function(LAT, LON){ try { if (previewMarker){ map.removeLayer(previewMarker); previewMarker=null; } var prevIcon = L.icon({ iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(mkDotSvg('#ff3b30')), iconSize: [30,30], iconAnchor: [15,15] }); previewMarker = L.marker([LAT, LON], { icon: prevIcon, opacity: 0.95 }).addTo(map); } catch(_){} },
          clearPreview: function(){ try { if (previewMarker){ map.removeLayer(previewMarker); previewMarker=null; } } catch(_){} },
          setUserLocation: function(LAT, LON){ try { if (userMarker){ userMarker.setLatLng([LAT,LON]); } } catch(_){} },
          setDestination: function(LAT, LON){ try { if (destMarker){ map.removeLayer(destMarker); destMarker=null; } if (line){ map.removeLayer(line); line=null; } var destIcon = L.icon({ iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(mkDotSvg('#111')), iconSize: [30,30], iconAnchor: [15,15] }); destMarker = L.marker([LAT, LON], { icon: destIcon }).addTo(map); var s = startPoint || [${lat}, ${lon}]; var url='https://router.project-osrm.org/route/v1/driving/'+(s[1])+','+(s[0])+';'+(LON)+','+(LAT)+'?overview=full&geometries=geojson&alternatives=false&annotations=duration,distance'; fetch(url).then(r=>r.json()).then(function(j){ try { if(!j||!j.routes||!j.routes[0]) throw new Error('no-route'); var route=j.routes[0]; var coords = route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; }); line = L.polyline(coords, { color:'#0a84ff', weight:4 }).addTo(map); var b = line.getBounds(); map.fitBounds(b, { padding:[40,40] }); var dist=Math.round(route.distance), dur=Math.round(route.duration); post('route',{ distance:dist, distanceText:(dist/1000).toFixed(1)+' км', duration:dur, durationText: Math.round(dur/60)+' мин' }); } catch(err){ var coords2 = [ [s[0], s[1]], [LAT, LON] ]; line = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map); map.fitBounds(line.getBounds(), { padding:[40,40] }); var d2=haversine(s[0],s[1],LAT,LON); var t2=Math.round(d2/(40*1000/3600)); post('route',{ distance:Math.round(d2), distanceText:(d2/1000).toFixed(1)+' км', duration:t2, durationText: Math.round(t2/60)+' мин' }); } }).catch(function(){ var coords2 = [ [s[0], s[1]], [LAT, LON] ]; line = L.polyline(coords2, { color:'#0a84ff', dashArray:'6,6', weight:4 }).addTo(map); map.fitBounds(line.getBounds(), { padding:[40,40] }); var d2=haversine(s[0],s[1],LAT,LON); var t2=Math.round(d2/(40*1000/3600)); post('route',{ distance:Math.round(d2), distanceText:(d2/1000).toFixed(1)+' км', duration:t2, durationText: Math.round(t2/60)+' мин' }); }); } catch(_){} },
          clearDestination: function(){ try { if (destMarker){ map.removeLayer(destMarker); destMarker=null; } if (line){ map.removeLayer(line); line=null; } } catch(_){} },
          clearRouteOnly: function(){ try { if (line){ map.removeLayer(line); line=null; } } catch(_){} },
          clearAll: function(){ try { if (previewMarker){ map.removeLayer(previewMarker); previewMarker=null; } if (destMarker){ map.removeLayer(destMarker); destMarker=null; } if (line){ map.removeLayer(line); line=null; } userSetStart=false; startPoint=[${lat},${lon}]; if (currentMarker){ currentMarker.setLatLng([${lat},${lon}]); } } catch(_){} }
        };
  map.on('click', function(e){ try { var c=e.latlng; post('mapClick',{ latitude:c.lat, longitude:c.lng, address:null }); } catch(_){} });
        post('ready', {});
      } catch(e){ post('error', { message: e && (e.message||e.toString()) }); }
    }
    window.onload = function(){
      try {
        // Если WebGL не поддерживается — запускаем фолбэк на Leaflet (растровые OSM-тайлы)
        if (!(maplibregl && maplibregl.supported && maplibregl.supported({ failIfMajorPerformanceCaveat: false }))) {
          initLeaflet();
          return;
        }
  var map = new maplibregl.Map({
          container: 'map',
          ${mtEnabled ? `style: '${mtStyleUrl}',` : `style: { version: 8, sources: { 'osm-raster': { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png','https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } }, layers: [ { id: 'osm-tiles', type: 'raster', source: 'osm-raster' } ] },`}
          center: [${lon}, ${lat}],
          zoom: ${initialZoom},
          failIfMajorPerformanceCaveat: false,
          cooperativeGestures: true
        });
        try { map.once('load', function(){ try { map.setZoom(${initialZoom + 2}); } catch(_){} }); } catch(_){}
        map.addControl(new maplibregl.NavigationControl({ showCompass:false }), 'top-right');
        try {
          // Reduce raster fade-in to make tile transitions less visible
          map.setPaintProperty('osm-tiles', 'raster-fade-duration', 150);
          map.setPaintProperty('osm-tiles', 'raster-opacity', 1.0);
        } catch(e){}

  var startPoint = [${lat}, ${lon}];
        var userSetStart = false;
  function mkDot(color){ var el=document.createElement('div'); el.style.width='30px'; el.style.height='30px'; el.style.borderRadius='50%'; el.style.background=color; el.style.boxShadow='0 0 0 2px #ffffffcc'; return el; }
  var currentMarker = new maplibregl.Marker({ element: mkDot('#0a84ff'), anchor:'center' }).setLngLat([${lon}, ${lat}]).addTo(map);
  var userPulseEl = (function(){ var el=document.createElement('div'); el.style.position='relative'; var core=mkDot('#1166ff'); core.style.width='30px'; core.style.height='30px'; core.style.boxShadow='0 0 0 2px #ffffffcc'; var ring=document.createElement('div'); ring.style.position='absolute'; ring.style.left='-12px'; ring.style.top='-12px'; ring.style.width='54px'; ring.style.height='54px'; ring.style.borderRadius='50%'; ring.style.border='2px solid rgba(17,102,255,0.35)'; el.appendChild(core); el.appendChild(ring); return el; })();
  var userMarker = new maplibregl.Marker({ element: userPulseEl, anchor:'center' }).setLngLat([${lon}, ${lat}]).addTo(map);
  var previewMarker = null; var destMarker = null;

        var routeSourceId = 'route-src'; var routeLayerId = 'route-line';
        function ensureRouteSource(){
          if (!map.getSource(routeSourceId)){
            map.addSource(routeSourceId, { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
          }
          if (!map.getLayer(routeLayerId)){
            map.addLayer({ id: routeLayerId, type:'line', source: routeSourceId, paint: { 'line-color':'#0a84ff', 'line-width': 4 } });
          }
        }

        window.App = {
          // disableClicks removed per UX decision
          setStart: function(LAT, LON, LOCK){ try { startPoint=[LAT,LON]; userSetStart=!!LOCK; if (currentMarker){ currentMarker.setLngLat([LON,LAT]); } } catch(_){} },
          setStartVisible: function(V){ try { V=!!V; if (!V){ if (currentMarker){ currentMarker.remove(); currentMarker=null; } } else { if (!currentMarker){ currentMarker = new maplibregl.Marker({ element: mkDot('#0a84ff'), anchor:'center' }).setLngLat([ (startPoint?startPoint[1]:${lon}), (startPoint?startPoint[0]:${lat}) ]).addTo(map); } } } catch(_){} },
          setCenter: function(LAT, LON){ try { map.easeTo({ center:[LON,LAT], duration:500 }); if (!userSetStart){ startPoint=[LAT,LON]; if (currentMarker){ currentMarker.setLngLat([LON,LAT]); } } } catch(_){} },
          setPreview: function(LAT, LON){ try { if (previewMarker){ previewMarker.remove(); previewMarker=null; } previewMarker = new maplibregl.Marker({ element: mkDot('#ff3b30'), anchor:'center' }).setLngLat([LON,LAT]).addTo(map); } catch(_){} },
          clearPreview: function(){ try { if (previewMarker){ previewMarker.remove(); previewMarker=null; } } catch(_){} },
          setUserLocation: function(LAT, LON){ try { if (userMarker){ userMarker.setLngLat([LON,LAT]); } } catch(_){} },
          setDestination: function(LAT, LON){ try { ensureRouteSource(); if (destMarker){ destMarker.remove(); destMarker=null; } destMarker = new maplibregl.Marker({ element: mkDot('#111'), anchor:'center' }).setLngLat([LON,LAT]).addTo(map); var s=startPoint||[${lat},${lon}]; var url='https://router.project-osrm.org/route/v1/driving/'+(s[1])+','+(s[0])+';'+(LON)+','+(LAT)+'?overview=full&geometries=geojson&alternatives=false&annotations=duration,distance'; fetch(url).then(r=>r.json()).then(function(j){ try { if(!j||!j.routes||!j.routes[0]) throw new Error('no-route'); var route=j.routes[0]; var gj={ type:'FeatureCollection', features:[ { type:'Feature', geometry: route.geometry, properties:{} } ] }; map.getSource(routeSourceId).setData(gj); var minX=route.geometry.coordinates[0][0], minY=route.geometry.coordinates[0][1], maxX=minX, maxY=minY; route.geometry.coordinates.forEach(function(c){ minX=Math.min(minX,c[0]); minY=Math.min(minY,c[1]); maxX=Math.max(maxX,c[0]); maxY=Math.max(maxY,c[1]); }); map.fitBounds([ [minX,minY], [maxX,maxY] ], { padding: 40, duration: 500 }); var dist=Math.round(route.distance), dur=Math.round(route.duration); post('route',{ distance:dist, distanceText:(dist/1000).toFixed(1)+' км', duration:dur, durationText: Math.round(dur/60)+' мин' }); try { var u2='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+LAT+'&lon='+LON+'&accept-language=ru'; fetch(u2).then(rr=>rr.json()).then(function(d){ var a=(d&&(d.name||d.display_name))||''; if (a && destMarker){ destMarker.setPopup(new maplibregl.Popup({ offset: 25 }).setText(a)).togglePopup(); } }).catch(function(){}); } catch(e){} } catch(err){ var gj2={ type:'FeatureCollection', features:[ { type:'Feature', geometry:{ type:'LineString', coordinates:[ [s[1],s[0]],[LON,LAT] ] }, properties:{} } ] }; map.getSource(routeSourceId).setData(gj2); var d2=haversine(s[0],s[1],LAT,LON); var t2=Math.round(d2/(40*1000/3600)); post('route', { distance: Math.round(d2), distanceText:(d2/1000).toFixed(1)+' км', duration: t2, durationText: Math.round(t2/60)+' мин' }); map.fitBounds([ [Math.min(s[1],LON), Math.min(s[0],LAT)], [Math.max(s[1],LON), Math.max(s[0],LAT)] ], { padding: 40, duration: 500 }); } }).catch(function(){ var gj2={ type:'FeatureCollection', features:[ { type:'Feature', geometry:{ type:'LineString', coordinates:[ [s[1],s[0]],[LON,LAT] ] }, properties:{} } ] }; map.getSource(routeSourceId).setData(gj2); var d2=haversine(s[0],s[1],LAT,LON); var t2=Math.round(d2/(40*1000/3600)); post('route', { distance: Math.round(d2), distanceText:(d2/1000).toFixed(1)+' км', duration: t2, durationText: Math.round(t2/60)+' мин' }); map.fitBounds([ [Math.min(s[1],LON), Math.min(s[0],LAT)], [Math.max(s[1],LON), Math.max(s[0],LAT)] ], { padding: 40, duration: 500 }); }); } catch(_){} },
          clearDestination: function(){ try { if (destMarker){ destMarker.remove(); destMarker=null; } if (map.getSource(routeSourceId)){ map.getSource(routeSourceId).setData({ type:'FeatureCollection', features:[] }); } } catch(_){} },
          clearRouteOnly: function(){ try { if (map.getSource(routeSourceId)){ map.getSource(routeSourceId).setData({ type:'FeatureCollection', features:[] }); } } catch(_){} },
          clearAll: function(){ try { if (previewMarker){ previewMarker.remove(); previewMarker=null; } if (destMarker){ destMarker.remove(); destMarker=null; } if (map.getSource(routeSourceId)){ map.getSource(routeSourceId).setData({ type:'FeatureCollection', features:[] }); } userSetStart=false; startPoint=[${lat},${lon}]; if (currentMarker){ currentMarker.setLngLat([${lon},${lat}]); } } catch(_){} }
        };

        map.on('load', function(){
          try { ensureRouteSource(); } catch(_){ }
          ${mtEnabled ? `
          try {
            var style = map.getStyle();
            if (style && Array.isArray(style.layers)) {
              style.layers.forEach(function(l){
                if (l.type === 'symbol') { try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch(e){} }
              });
            }
          } catch(e){}
          ` : ''}
        });
  // На клик отправляем координаты сразу, без ожидания адреса (RN сделает reverse geocode отдельно)
  map.on('click', function(e){ var c=e.lngLat; try { post('mapClick', { latitude:c.lat, longitude:c.lng, address:null }); } catch(_){ /* noop */ } });
        post('ready', {});
      } catch(e){ try { initLeaflet(); } catch(_){} }
    }
  </script>
  </head>
  <body>
  <div id="map" style="width:100%;height:100%"></div>
  <div class="osm-attr">${attrText}</div>
  </body>
</html>`;
    }

    // Yandex JS API branch
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <style>
    html, body, #map { height:100%; margin:0; padding:0; }
  .right-controls { position:absolute; top:12px; right:12px; z-index:1000; display:flex; flex-direction:column; gap:8px; }
  .layer-switcher { position:relative; background:rgba(255, 255, 255, 1); border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.12); display:flex; flex-direction:column; }
  .layer-btn { border:none; background:none; padding:6px 10px; font:600 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color: #222; cursor:pointer; outline:none; transition:background 0.15s; border-radius:4px; margin:0px; }
    .layer-btn.selected { background: #3697f9ff; color: #fff; font-weight: 400;}
  .traffic-switcher { position:absolute; top:80px;  right:0px; background:rgba(255,255,255,1); border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.12); display:flex; }
  .traffic-btn { border:none; background:none; padding:6px 12px; font:600 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#222; cursor:pointer; outline:none; transition:background 0.15s,color 0.15s; border-radius:4px; }
  .traffic-btn.active { background: #3697f9ff; color:#fff; }
  .zoom-ctrl {top:150px; right:0px; width:max-content; position:absolute; background:rgba(255,255,255,0.95); border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.12); display:flex; flex-direction:column; overflow:hidden; }
  .zoom-btn { border:none; background:none; width:36px; height:36px; font:700 18px/36px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#222; cursor:pointer; outline:none; transition:background .15s,color .15s; }
  .zoom-btn:hover { background:#0a84ff; color:#fff; }
  </style>
  <script src="https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU"></script>
  <script>
  function post(type, payload){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type, payload})); }
  window.onerror = function(message, source, lineno, colno, error){ try { post('error', { message: String(message), source, line: lineno, col: colno }); } catch(_){} };
  window.onunhandledrejection = function(e){ try { var msg=(e&&e.reason&&e.reason.message)||String(e&&e.reason||e); post('error', { message: msg }); } catch(_){} };
    ymaps.ready(function(){
      try {
        var map = new ymaps.Map('map', { center: [${lat}, ${lon}], zoom: ${initialZoom}, controls: [] });
        try { var _z = map.getZoom(); map.setZoom(${initialZoom + 3}, { duration: 0 }); } catch(_){}
  // (custom zoom will be appended inside rightCtrls below)
          var currentType = '${yandexType}';
          try { map.setType(currentType); } catch(_){ }
          // Кастомный контрол выбора слоя
          var types = [
            { id: 'yandex#map', label: 'Схема' },
            { id: 'yandex#satellite', label: 'Спутник' },
            { id: 'yandex#hybrid', label: 'Гибрид' }
          ];
          var rightCtrls = document.createElement('div');
          rightCtrls.className = 'right-controls';
          var switcher = document.createElement('div');
          switcher.className = 'layer-switcher';
          types.forEach(function(t){
            var btn = document.createElement('button');
            btn.className = 'layer-btn' + (t.id===currentType?' selected':'');
            btn.innerText = t.label;
            btn.onclick = function(){
              currentType = t.id;
              map.setType(currentType);
              Array.from(switcher.children).forEach(function(b){ b.classList.remove('selected'); });
              btn.classList.add('selected');
            };
            switcher.appendChild(btn);
          });
          rightCtrls.appendChild(switcher);
          // Traffic toggle
          var trafficWrap = document.createElement('div');
          trafficWrap.className = 'traffic-switcher';
          var trafficBtn = document.createElement('button');
          trafficBtn.className = 'traffic-btn';
          trafficBtn.innerText = 'Пробки';
      // Use provider directly (no built-in UI)
      var trafficProvider = null; var trafficOn = false;
          function toggleTraffic(on){
            try {
        if (!ymaps.traffic || !ymaps.traffic.provider || !ymaps.traffic.provider.Actual) return;
        on = !!on;
        if (!trafficProvider) trafficProvider = new ymaps.traffic.provider.Actual({ infoLayerShown: true });
        trafficProvider.setMap(on ? map : null);
              trafficOn = on;
              if (trafficBtn && trafficBtn.classList) trafficBtn.classList.toggle('active', trafficOn);
            } catch(_){ }
          }
          trafficBtn.onclick = function(){ toggleTraffic(!trafficOn); };
          trafficWrap.appendChild(trafficBtn);
          rightCtrls.appendChild(trafficWrap);
          // Traffic is off by default; user can enable via button
          // Append zoom below layers
          try {
            var zoomCtrl = document.createElement('div');
            zoomCtrl.className = 'zoom-ctrl';
            var btnIn = document.createElement('button'); btnIn.className = 'zoom-btn'; btnIn.innerText = '+';
            var btnOut = document.createElement('button'); btnOut.className = 'zoom-btn'; btnOut.innerText = '−';
            btnIn.onclick = function(){ try { var z = map.getZoom(); map.setZoom(z+1, { duration: 200 }); } catch(_){} };
            btnOut.onclick = function(){ try { var z = map.getZoom(); map.setZoom(z-1, { duration: 200 }); } catch(_){} };
            zoomCtrl.appendChild(btnIn); zoomCtrl.appendChild(btnOut);
            rightCtrls.appendChild(zoomCtrl);
          } catch(e){}
          setTimeout(function(){ document.body.appendChild(rightCtrls); }, 300);
        function mkIcon(color){ return {
          iconLayout: 'default#image',
          iconImageHref: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="'+color+'"/></svg>'),
          iconImageSize: [30,30],
          iconImageOffset: [-15,-15]
        }; }
  var previewPlacemark = null; var routeObj = null; var destPlacemark = null; var startPoint=[${lat},${lon}]; var userSetStart=false; var startPlacemark = new ymaps.Placemark(startPoint, { hintContent: 'Старт' }, mkIcon('#0a84ff')); map.geoObjects.add(startPlacemark);
  var userPlacemark = new ymaps.Placemark([${lat},${lon}], { hintContent: 'Вы здесь' }, mkIcon('#a2a2a1ff')); map.geoObjects.add(userPlacemark);
        window.App = {
          // disableClicks removed per UX decision
          setCenter: function(LAT, LON){
            try {
              // Smooth pan to new center
              if (map && map.panTo) { map.panTo([LAT, LON], { duration: 500 }); }
              else { map.setCenter([LAT, LON]); }
              if (!userSetStart){ startPoint=[LAT,LON]; if (startPlacemark) startPlacemark.geometry.setCoordinates(startPoint); }
            } catch(_){}
          },
          setPreview: function(LAT, LON){ try { if (previewPlacemark) map.geoObjects.remove(previewPlacemark); previewPlacemark = new ymaps.Placemark([LAT, LON], {}, mkIcon('#30b0ffff')); map.geoObjects.add(previewPlacemark); } catch(_){} },
          setStart: function(LAT,LON,LOCK){ try { startPoint=[LAT,LON]; userSetStart=!!LOCK; startPlacemark.geometry.setCoordinates(startPoint); } catch(_){} },
          setUserLocation: function(LAT,LON){ try { if (userPlacemark){ userPlacemark.geometry.setCoordinates([LAT,LON]); } } catch(_){} },
          setStartVisible: function(V){ try { V=!!V; if (!V){ if (startPlacemark){ map.geoObjects.remove(startPlacemark); startPlacemark=null; } } else { if (!startPlacemark){ startPlacemark = new ymaps.Placemark(startPoint, { hintContent: 'Старт' }, mkPinIcon('A', '#0a84ff')); map.geoObjects.add(startPlacemark); } } } catch(_){} },
          setDestination: function(LAT, LON){ try { if (routeObj) { map.geoObjects.remove(routeObj); routeObj=null; } if (destPlacemark){ map.geoObjects.remove(destPlacemark); destPlacemark=null; } destPlacemark = new ymaps.Placemark([LAT, LON], {}, mkIcon('#111')); map.geoObjects.add(destPlacemark); var mr = new ymaps.multiRouter.MultiRoute({ referencePoints: [startPoint, [LAT, LON]] }, { boundsAutoApply: true }); mr.model.events.add('requestsuccess', function(){ try { var ar = mr.getActiveRoute(); if (ar){ var dist = ar.properties.get('distance'); var dur = ar.properties.get('duration'); post('route', { distance: dist && dist.value, distanceText: dist && dist.text, duration: dur && dur.value, durationText: dur && dur.text }); } } catch(_){} }); map.geoObjects.add(mr); routeObj = mr; } catch(_){} },
          clearDestination: function(){ try { if (routeObj){ map.geoObjects.remove(routeObj); routeObj=null; } if (destPlacemark){ map.geoObjects.remove(destPlacemark); destPlacemark=null; } } catch(_){} },
          clearRouteOnly: function(){ try { if (routeObj){ map.geoObjects.remove(routeObj); routeObj=null; } } catch(_){} },
          clearAll: function(){ try { if (previewPlacemark){ map.geoObjects.remove(previewPlacemark); previewPlacemark=null; } if (routeObj){ map.geoObjects.remove(routeObj); routeObj=null; } if (destPlacemark){ map.geoObjects.remove(destPlacemark); destPlacemark=null; } userSetStart=false; startPoint=[${lat},${lon}]; startPlacemark.geometry.setCoordinates(startPoint); } catch(_){} }
        };
  map.events.add('click', function (e) { var coords = e.get('coords'); try { ymaps.geocode(coords).then(function(res){ var first = res.geoObjects.get(0); var addr = first && first.getAddressLine ? first.getAddressLine() : (first && first.getAddress && first.getAddress() && first.getAddress().formatted); post('mapClick', { latitude: coords[0], longitude: coords[1], address: addr || null }); }, function(){ post('mapClick', { latitude: coords[0], longitude: coords[1], address: null }); }); } catch(_){ post('mapClick', { latitude: coords[0], longitude: coords[1], address: null }); } });
        post('ready', {});
      } catch(e){ post('error', { message: e && (e.message||e.toString()) }); }
    });
  </script>
  </head>
  <body><div id="map"></div></body>
</html>`;
  }, [apiKey, lat, lon, initialZoom]);

  // Любое изменение center после инициализации двигаем через JS, не пересобирая HTML
  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = center?.latitude, lon2 = center?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try {
        webRef.current.injectJavaScript(`window.App && window.App.setCenter(${lat2}, ${lon2}); true;`);
      } catch(_) {}
    }
  }, [center?.latitude, center?.longitude]);

  const source = useMemo(() => ({ html }), [html]);

  // Hard shield to block any touches to the WebView briefly
  // click suppression removed per UX decision

  // Update start position; lock only when startIsManual=true
  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = start?.latitude, lon2 = start?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try {
        webRef.current.injectJavaScript(`window.App && window.App.setStart && window.App.setStart(${lat2}, ${lon2}, ${startIsManual ? 'true' : 'false'}); true;`);
      } catch(_) {}
    }
  }, [start?.latitude, start?.longitude, startIsManual]);

  // toggle start marker visibility
  useEffect(() => {
    if (!webRef.current) return;
    try { webRef.current.injectJavaScript(`window.App && window.App.setStartVisible && window.App.setStartVisible(${startVisible ? 'true' : 'false'}); true;`); } catch(_) {}
  }, [startVisible]);

  // update persistent user location marker
  useEffect(() => {
    if (!webRef.current) return;
    const lat2 = userLocation?.latitude, lon2 = userLocation?.longitude;
    if (Number.isFinite(lat2) && Number.isFinite(lon2)) {
      try { webRef.current.injectJavaScript(`window.App && window.App.setUserLocation && window.App.setUserLocation(${lat2}, ${lon2}); true;`); } catch(_) {}
    }
  }, [userLocation?.latitude, userLocation?.longitude]);

  // preview marker
  useEffect(() => {
    if (!webRef.current) return;
    if (preview && typeof preview.latitude === 'number' && typeof preview.longitude === 'number') {
      webRef.current.injectJavaScript(`window.App && window.App.setPreview(${preview.latitude}, ${preview.longitude}); true;`);
    } else {
      webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); true;');
    }
  }, [preview]);

  // manual start removed in favor of start+startIsManual effect above

  // destination
  useEffect(() => {
    if (!webRef.current) return;
    if (destination && typeof destination.latitude === 'number' && typeof destination.longitude === 'number') {
  // Do not override start on destination set; start is controlled via start prop
      webRef.current.injectJavaScript(`window.App && window.App.setDestination(${destination.latitude}, ${destination.longitude}); true;`);
    } else {
      webRef.current.injectJavaScript('window.App && window.App.clearDestination && window.App.clearDestination(); true;');
    }
  }, [destination, recenterCoords]);

  // recenter
  useEffect(() => {
    if (!webRef.current || !recenterAt) return;
    const { latitude, longitude } = recenterCoords || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
    webRef.current.injectJavaScript(`window.App && window.App.setCenter(${latitude}, ${longitude}); true;`);
  }, [recenterAt]);

  // reset overlays
  useEffect(() => {
    if (!webRef.current || !resetAt) return;
    webRef.current.injectJavaScript('window.App && window.App.clearAll && window.App.clearAll(); true;');
  }, [resetAt]);

  // force-clear destination/route and preview when requested
  useEffect(() => {
    if (!webRef.current || !clearDestinationAt) return;
    try {
      webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); window.App && window.App.clearDestination && window.App.clearDestination(); true;');
    } catch (_) {}
  }, [clearDestinationAt]);

  // clear only the route polyline, keep destination marker
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
              // On first ready, enforce a clean slate in case clears were sent before init
              try {
                webRef.current && webRef.current.injectJavaScript('window.App && window.App.clearPreview && window.App.clearPreview(); window.App && window.App.clearDestination && window.App.clearDestination(); true;');
              } catch (_) {}
              onReady && onReady();
            }
            if (type === 'error') { onError && onError(payload || {}); }
            if (type === 'mapClick') onMapClick && onMapClick(payload);
            if (type === 'route') onRoute && onRoute(payload);
          } catch (_) {}
        }}
        onError={onError}
        onHttpError={onError}
        style={{ flex: 1 }}
  overScrollMode={Platform.OS === 'android' ? 'never' : 'auto'}
  androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
  androidHardwareAccelerationDisabled={false}
      />
  {/* touch shield removed per UX decision */}
    </View>
  );
}
