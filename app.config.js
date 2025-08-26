// Dynamic Expo config to inject Google Maps API key from env at build time
// Falls back to the value from app.json if env is not set

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => {
  const base = require('./app.json').expo;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || base?.android?.config?.googleMaps?.apiKey || '';

  return {
    ...base,
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
