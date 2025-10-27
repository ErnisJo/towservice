import Constants from 'expo-constants';
import { Platform, NativeModules } from 'react-native';

// Single source of truth for backend base URL
export function getApiBase() {
  const cfg = Constants?.expoConfig?.extra?.apiBase || 'http://localhost:4001';
  try {
    const u = new URL(cfg);
    const protocol = u.protocol || 'http:';
    const host = u.hostname || 'localhost';
    const port = u.port || '4001';
    // On device/emulator, replace localhost with Metro host IP
    if ((host === 'localhost' || host === '127.0.0.1') && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:${port}`;
      } catch {}
    }
    return `${protocol}//${host}${port ? `:${port}` : ''}`;
  } catch {
    // Fallback if URL parsing fails
    let base = cfg;
    if (/:4000\b/.test(base)) base = base.replace(':4000', ':4001');
    if (/localhost|127\.0\.0\.1/.test(base) && Platform.OS !== 'web') {
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
        const m = scriptURL && scriptURL.match(/^(https?:)\/\/(.*?):\d+/);
        if (m) return `${m[1]}//${m[2]}:4001`;
      } catch {}
    }
    return base;
  }
}

// Optional helper: flip port between 4000 and 4001 (for dev fallback)
export function togglePort(base) {
  if (!base) return base;
  if (base.includes(':4000')) return base.replace(':4000', ':4001');
  if (base.includes(':4001')) return base.replace(':4001', ':4000');
  return base;
}
