// Polyfill browser globals for Expo SSR/static export in Node.js
if (typeof global.window === 'undefined') {
  global.window = {
    localStorage: {
      _data: {},
      getItem(key) { return this._data[key] ?? null; },
      setItem(key, val) { this._data[key] = String(val); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; },
    },
    location: { href: '', origin: '', pathname: '/' },
    navigator: { userAgent: 'node' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}
if (typeof global.localStorage === 'undefined') {
  global.localStorage = global.window.localStorage;
}
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
