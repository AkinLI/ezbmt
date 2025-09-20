import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

type BgState = {
uri: string | null;
opacity: number; // 0..1
load: () => Promise<void>;
setOpacity: (v: number) => Promise<void>;
setFromBase64: (base64: string, ext?: string) => Promise<void>; // 寫入檔案後啟用
clear: () => Promise<void>;
};

const KEY = 'app_bg_v1';

export const useBgStore = create<BgState>((set, get) => ({
uri: null,
opacity: 0.25,

load: async () => {
try {
const s = await AsyncStorage.getItem(KEY);
if (!s) return;
const obj = JSON.parse(s || '{}') as { uri?: string; opacity?: number };
// 檢查檔案是否存在（file://）
if (obj?.uri && obj.uri.startsWith('file://')) {
const p = obj.uri.replace('file://', '');
const ok = await RNFS.exists(p);
if (!ok) {
await AsyncStorage.removeItem(KEY);
set({ uri: null, opacity: obj.opacity ?? 0.25 });
return;
}
}
set({ uri: obj?.uri || null, opacity: typeof obj?.opacity === 'number' ? obj.opacity : 0.25 });
} catch {
// ignore
}
},

setOpacity: async (v: number) => {
set({ opacity: v });
try {
const cur = get();
await AsyncStorage.setItem(KEY, JSON.stringify({ uri: cur.uri, opacity: v }));
} catch {}
},

setFromBase64: async (base64: string, ext = 'jpg') => {
try {
const dir = RNFS.DocumentDirectoryPath;
const dest = `${dir}/app_bg.${ext.toLowerCase()}`;
await RNFS.writeFile(dest, base64, 'base64');
const uri = `file://${dest}`;
set({ uri });
const cur = get();
await AsyncStorage.setItem(KEY, JSON.stringify({ uri, opacity: cur.opacity }));
} catch (e) {
throw e;
}
},

clear: async () => {
try {
const s = await AsyncStorage.getItem(KEY);
if (s) {
const obj = JSON.parse(s || '{}') as { uri?: string; opacity?: number };
if (obj?.uri?.startsWith('file://')) {
const p = obj.uri.replace('file://', '');
try { await RNFS.unlink(p); } catch {}
}
}
} catch {}
set({ uri: null });
try {
const cur = get();
await AsyncStorage.setItem(KEY, JSON.stringify({ uri: null, opacity: cur.opacity }));
} catch {}
},
}));