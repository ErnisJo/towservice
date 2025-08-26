import React, { useEffect, useMemo } from 'react';
import { View, Platform } from 'react-native';

// Lightweight Yandex Maps embed using JS API (no native SDK required)
export default function YandexMap({ center, zoom = 14, onReady, onError }) {
  let WebViewComp = null;
  try {
    // Lazily require to avoid crash in Expo Go if native module is missing
    WebViewComp = require('react-native-webview').WebView;
  } catch (e) {
    // Notify parent and render nothing to trigger fallback
    useEffect(() => {
      onError && onError(e);
    }, []);
    return <View style={{ flex: 1 }} />;
  }
  const html = useMemo(() => {
    const lat = center?.latitude ?? 55.751244;
    const lon = center?.longitude ?? 37.618423;
    const content = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no, width=device-width" />
  <style>html, body, #map { height:100%; margin:0; padding:0; }</style>
  <script src="https://api-maps.yandex.ru/2.1/?apikey=&lang=ru_RU"></script>
  <script>
    function post(type, payload){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type, payload})); }
    ymaps.ready(function(){
      try {
        var map = new ymaps.Map('map', { center: [${lat}, ${lon}], zoom: ${zoom}, controls: ['zoomControl'] });
        var placemark = new ymaps.Placemark([${lat}, ${lon}], { hintContent: 'Вы здесь' }, { preset: 'islands#blueCircleIcon' });
        map.geoObjects.add(placemark);
        post('ready', {});
      } catch(e){ post('error', { message: e && (e.message||e.toString()) }); }
    });
  </script>
  </head>
  <body><div id="map"></div></body>
</html>`;
    return content;
  }, [center, zoom]);

  return (
    <View style={{ flex: 1 }}>
  <WebViewComp
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          try {
            const { type } = JSON.parse(e.nativeEvent.data || '{}');
            if (type === 'ready') onReady && onReady();
            if (type === 'error') onError && onError();
          } catch (_) {}
        }}
        onError={onError}
        onHttpError={onError}
        style={{ flex: 1 }}
        // Disable overscroll glow on Android
        overScrollMode={Platform.OS === 'android' ? 'never' : 'auto'}
        // Improve gesture perf
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
      />
    </View>
  );
}
