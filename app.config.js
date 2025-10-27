// Dynamic Expo config to inject Google Maps API key from env at build time
// Falls back to the value from app.json if env is not set

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => {
  const base = require('./app.json').expo;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || base?.android?.config?.googleMaps?.apiKey || '';
  const dgisKey = process.env.DGIS_API_KEY || process.env.TWOGIS_API_KEY || base?.extra?.dgisApiKey || '';
  const locationIqKey = process.env.LOCATIONIQ_API_KEY || base?.extra?.locationIqKey || '';
  const apiBase = process.env.API_BASE || base?.extra?.apiBase || 'http://localhost:4001';

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      googleMapsApiKey: apiKey,
  dgisApiKey: dgisKey,
  locationIqKey,
  apiBase,
    },
    android: {
      ...base.android,
      config: {
        ...(base.android?.config || {}),
        googleMaps: {
          apiKey,
        },
      },
    },
  };
};
