/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => {
  const base = require('./app.json').expo;
  const mapProvider = process.env.MAP_PROVIDER || base?.extra?.mapProvider || 'maptiler';
  const dgisKey = process.env.DGIS_API_KEY || base?.extra?.dgisApiKey || '';
  const maptilerKey = process.env.MAPTILER_API_KEY || base?.extra?.maptilerApiKey || 'stW9wsgeZAe9aiEaxvNR';
  const maptilerLanguage = process.env.MAPTILER_LANGUAGE || base?.extra?.mapTiles?.language || 'ru';
  const maptilerStyle = process.env.MAPTILER_STYLE || base?.extra?.mapTiles?.style || 'streets-v2';
  const apiBase = process.env.API_BASE || base?.extra?.apiBase || 'http://192.168.0.102:4001';

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      mapProvider,
      dgisApiKey: dgisKey,
      maptilerApiKey: maptilerKey,
      mapLanguage: maptilerLanguage,
      apiBase,
      mapTiles: {
        provider: mapProvider,
        apiKey: mapProvider === '2gis' ? dgisKey : maptilerKey,
        style: maptilerStyle,
        language: maptilerLanguage,
      },
    },
  };
};
