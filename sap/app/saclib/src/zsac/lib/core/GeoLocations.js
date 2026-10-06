/**
 * Where members of a dimension are on the map (pure). A member is placed by its id or its text: a country (name, ISO 2 or 3 letters),
 * one of the sales regions (EMEA, APAC, AMER, LATAM...), or a line of the widget's own list "Member = latitude, longitude".
 *
 *   GeoLocations.parseList(text) -> { places: { KEY: {lat, lon} }, errors }
 *   GeoLocations.find(member, label, own) -> { lat, lon } | null
 *   GeoLocations.project(lat, lon, w, h) -> { x, y }     equirectangular, the whole world in the box
 *   GeoLocations.WORLD -> coarse continent outlines as [[lon, lat], ...] (a backdrop, not a survey)
 */
sap.ui.define([], function () {
  "use strict";

  const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  // name, iso2, iso3, lat, lon (centre of the country, rounded)
  const COUNTRIES = [
    ["United States", "US", "USA", 39.8, -98.6], ["Canada", "CA", "CAN", 56.1, -106.3], ["Mexico", "MX", "MEX", 23.6, -102.5],
    ["Brazil", "BR", "BRA", -14.2, -51.9], ["Argentina", "AR", "ARG", -38.4, -63.6], ["Chile", "CL", "CHL", -35.7, -71.5], ["Colombia", "CO", "COL", 4.6, -74.3], ["Peru", "PE", "PER", -9.2, -75.0],
    ["United Kingdom", "GB", "GBR", 54.0, -2.0], ["Ireland", "IE", "IRL", 53.4, -8.2], ["France", "FR", "FRA", 46.2, 2.2], ["Germany", "DE", "DEU", 51.2, 10.4], ["Spain", "ES", "ESP", 40.5, -3.7],
    ["Portugal", "PT", "PRT", 39.4, -8.2], ["Italy", "IT", "ITA", 41.9, 12.6], ["Netherlands", "NL", "NLD", 52.1, 5.3], ["Belgium", "BE", "BEL", 50.5, 4.5], ["Switzerland", "CH", "CHE", 46.8, 8.2],
    ["Austria", "AT", "AUT", 47.5, 14.6], ["Sweden", "SE", "SWE", 60.1, 18.6], ["Norway", "NO", "NOR", 60.5, 8.5], ["Denmark", "DK", "DNK", 56.3, 9.5], ["Finland", "FI", "FIN", 61.9, 25.7],
    ["Poland", "PL", "POL", 51.9, 19.1], ["Czech Republic", "CZ", "CZE", 49.8, 15.5], ["Romania", "RO", "ROU", 45.9, 24.97], ["Greece", "GR", "GRC", 39.1, 21.8], ["Turkey", "TR", "TUR", 38.96, 35.2],
    ["Russia", "RU", "RUS", 61.5, 105.3], ["Ukraine", "UA", "UKR", 48.4, 31.2], ["Saudi Arabia", "SA", "SAU", 23.9, 45.1], ["United Arab Emirates", "AE", "ARE", 23.4, 53.8], ["Israel", "IL", "ISR", 31.0, 34.9],
    ["Egypt", "EG", "EGY", 26.8, 30.8], ["Nigeria", "NG", "NGA", 9.1, 8.7], ["Kenya", "KE", "KEN", -0.02, 37.9], ["South Africa", "ZA", "ZAF", -30.6, 22.9], ["Morocco", "MA", "MAR", 31.8, -7.1],
    ["India", "IN", "IND", 20.6, 78.96], ["Pakistan", "PK", "PAK", 30.4, 69.3], ["Bangladesh", "BD", "BGD", 23.7, 90.4], ["China", "CN", "CHN", 35.9, 104.2], ["Japan", "JP", "JPN", 36.2, 138.3],
    ["South Korea", "KR", "KOR", 35.9, 127.8], ["Taiwan", "TW", "TWN", 23.7, 121.0], ["Hong Kong", "HK", "HKG", 22.3, 114.2], ["Singapore", "SG", "SGP", 1.35, 103.8], ["Malaysia", "MY", "MYS", 4.2, 102.0],
    ["Indonesia", "ID", "IDN", -0.8, 113.9], ["Thailand", "TH", "THA", 15.9, 100.99], ["Vietnam", "VN", "VNM", 14.1, 108.3], ["Philippines", "PH", "PHL", 12.9, 121.8],
    ["Australia", "AU", "AUS", -25.3, 133.8], ["New Zealand", "NZ", "NZL", -40.9, 174.9]
  ];

  // sales regions as the sample data and most ERPs name them: the middle of the area
  const REGIONS = [
    ["EMEA", 35, 20], ["Europe", 50, 10], ["Middle East", 28, 45], ["Africa", 5, 20], ["APAC", 15, 110], ["Asia", 30, 90], ["Asia Pacific", 15, 110], ["Oceania", -25, 140],
    ["AMER", 20, -90], ["Americas", 20, -90], ["North America", 45, -100], ["NA", 45, -100], ["LATAM", -15, -60], ["Latin America", -15, -60], ["South America", -15, -60],
    ["Eastern", 50, 30], ["World", 20, 10], ["Global", 20, 10]
  ];

  const index = new Map();
  COUNTRIES.forEach((c) => { [c[0], c[1], c[2]].forEach((k) => index.set(key(k), { lat: c[3], lon: c[4] })); });
  REGIONS.forEach((r) => index.set(key(r[0]), { lat: r[1], lon: r[2] }));

  function parseList(text) {
    const places = {}; const errors = [];
    String(text || "").split("\n").forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.charAt(0) === "#") { return; }
      const m = /^(.+?)\s*=\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(line);
      if (!m) { errors.push("Line " + (i + 1) + ": use Name = latitude, longitude"); return; }
      const lat = Number(m[2]); const lon = Number(m[3]);
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { errors.push("Line " + (i + 1) + ": latitude is -90 to 90 and longitude -180 to 180"); return; }
      places[key(m[1])] = { lat, lon };
    });
    return { places, errors };
  }

  function find(member, label, own) {
    const tries = [member, label].filter((x) => x !== undefined && x !== null && x !== "");
    // the widget's own list wins over the built-in places, for whichever spelling it uses
    for (let i = 0; i < tries.length; i++) { const k = key(tries[i]); if (own && own[k]) { return own[k]; } }
    for (let i = 0; i < tries.length; i++) { const k = key(tries[i]); if (index.has(k)) { return index.get(k); } }
    return null;
  }

  function project(lat, lon, w, h) { return { x: ((lon + 180) / 360) * w, y: ((90 - lat) / 180) * h }; }

  // very coarse outlines, enough to place bubbles on a recognisable world
  const WORLD = [
    [[-168, 66], [-140, 70], [-95, 72], [-80, 70], [-62, 60], [-55, 50], [-70, 42], [-76, 35], [-81, 25], [-97, 26], [-105, 20], [-95, 16], [-83, 9], [-80, 8], [-92, 15], [-110, 24], [-117, 32], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 62]],
    [[-73, 11], [-60, 8], [-50, 0], [-35, -7], [-40, -22], [-58, -38], [-65, -55], [-74, -50], [-72, -30], [-80, -5], [-78, 3]],
    [[-10, 36], [-9, 43], [-1, 46], [-5, 49], [4, 52], [8, 55], [10, 59], [20, 62], [28, 70], [40, 67], [30, 58], [28, 46], [36, 45], [26, 38], [18, 40], [12, 38], [3, 40]],
    [[-17, 21], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 11], [40, -5], [35, -25], [20, -35], [12, -18], [9, 4], [-8, 5], [-17, 14]],
    [[28, 46], [40, 67], [70, 73], [105, 78], [140, 72], [180, 68], [160, 58], [142, 46], [130, 35], [122, 30], [121, 22], [108, 12], [105, 9], [100, 14], [98, 8], [103, 1], [95, 16], [88, 22], [80, 14], [77, 8], [72, 20], [66, 25], [57, 25], [52, 17], [44, 12], [36, 28], [34, 36], [45, 41]],
    [[114, -22], [122, -17], [130, -12], [142, -11], [150, -22], [153, -28], [147, -38], [138, -35], [130, -32], [115, -34]],
    [[-55, 83], [-20, 82], [-20, 70], [-43, 60], [-55, 68]]
  ];

  return { find, parseList, project, WORLD, COUNTRIES, REGIONS };
});
