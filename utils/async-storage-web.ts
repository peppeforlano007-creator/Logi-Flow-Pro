// Web shim for @react-native-async-storage/async-storage
// Uses localStorage so it works in browser environments
const AsyncStorageWeb = {
  getItem: async (key: string): Promise<string | null> => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try { localStorage.setItem(key, value); } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try { localStorage.removeItem(key); } catch {}
  },
  clear: async (): Promise<void> => {
    try { localStorage.clear(); } catch {}
  },
  getAllKeys: async (): Promise<string[]> => {
    try { return Object.keys(localStorage); } catch { return []; }
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    try { return keys.map(k => [k, localStorage.getItem(k)]); } catch { return []; }
  },
  multiSet: async (pairs: [string, string][]): Promise<void> => {
    try { pairs.forEach(([k, v]) => localStorage.setItem(k, v)); } catch {}
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    try { keys.forEach(k => localStorage.removeItem(k)); } catch {}
  },
};
export default AsyncStorageWeb;
