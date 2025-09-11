import { supa, SUPABASE_URL } from './supabase'

// base64 -> Uint8Array（純 JS，不依賴外部套件）
function base64ToUint8Array(base64: string): Uint8Array {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let str = base64.replace(/[^A-Za-z0-9+/=]/g, '');
const len = str.length;
let bufferLength = str.length * 0.75;
if (str[str.length - 1] === '=') bufferLength--;
if (str[str.length - 2] === '=') bufferLength--;
const bytes = new Uint8Array(bufferLength);
let p = 0;
for (let i = 0; i < len; i += 4) {
const c1 = chars.indexOf(str[i]);
const c2 = chars.indexOf(str[i + 1]);
const c3 = chars.indexOf(str[i + 2]);
const c4 = chars.indexOf(str[i + 3]);
const n = (c1 << 18) | (c2 << 12) | ((c3 & 63) << 6) | (c4 & 63);
bytes[p++] = (n >> 16) & 255;
if (str[i + 2] !== '=') bytes[p++] = (n >> 8) & 255;
if (str[i + 3] !== '=') bytes[p++] = n & 255;
}
return bytes;
}

function ensureClient() {
if (!supa) {
throw new Error('Supabase client 未初始化。請檢查 src/lib/supabase.ts 是否已 createClient。');
}
if (!(supa as any).storage) {
throw new Error('supa.storage 不可用，請確認 @supabase/supabase-js 已安裝與 polyfill 已加入。');
}
}

// 主要：從 URI 讀檔並上傳（先嘗試 fetch arrayBuffer，失敗時用 RNFS 讀 file://）
export async function uploadImageFromUri(uri: string, path: string, contentType = 'image/jpeg'): Promise<string> {
ensureClient();

let ab: ArrayBuffer | null = null;

// 1) 優先用 fetch 取得 arrayBuffer（RN 0.71+ 支援）
try {
const res = await fetch(uri);
if (res && typeof (res as any).arrayBuffer === 'function') {
ab = await (res as any).arrayBuffer();
} else if (res && typeof (res as any).blob === 'function') {
const blob = await (res as any).blob();
if (blob && typeof (blob as any).arrayBuffer === 'function') {
ab = await (blob as any).arrayBuffer();
}
}
} catch {
// 忽略，改走 RNFS
}

// 2) 若還是空，且是 file://，改用 RNFS 讀 base64 再轉 ArrayBuffer
if ((!ab || ab.byteLength === 0) && uri.startsWith('file://')) {
try {
const RNFS = require('react-native-fs');
const base64 = await RNFS.readFile(uri.replace('file://', ''), 'base64');
const u8 = base64ToUint8Array(base64);
ab = u8.buffer;
} catch (_e) {
// 留待最後檢查
}
}

if (!ab || ab.byteLength === 0) {
throw new Error('讀取圖片內容失敗（arrayBuffer 為空）。請改用 includeBase64 或確認 uri 可讀。');
}

const { data, error } = await supa.storage.from('media').upload(path, ab, { contentType, upsert: false });
if (error) throw error;
return data?.path || path;
}

// 若 image-picker 有回傳 base64，可用這個直接上傳
export async function uploadImageBase64(base64: string, path: string, contentType = 'image/jpeg'): Promise<string> {
ensureClient();
const u8 = base64ToUint8Array(base64);
const ab = u8.buffer;
const { data, error } = await supa.storage.from('media').upload(path, ab, { contentType, upsert: false });
if (error) throw error;
return data?.path || path;
}

export function getPublicUrl(path: string): string {
ensureClient();
const { data } = supa.storage.from('media').getPublicUrl(path);
return data.publicUrl;
}

export async function removeFile(path: string): Promise<void> {
ensureClient();
const { error } = await supa.storage.from('media').remove([path]);
if (error) throw error;
}

export function publicUrlToPath(url: string): string | null {
try {
const marker = '/storage/v1/object/public/media/';
const idx = url.indexOf(marker);
if (idx < 0) return null;
return url.slice(idx + marker.length);
} catch {
return null;
}
}

export async function getSignedUploadUrl(matchId: string, ext: string, contentType: string) {
const { data, error } = await supa.functions.invoke('sign-upload', {
body: { matchId, contentType, ext },
});
if (error) throw error;
return data as { path: string; signedUrl: string };
}

export async function uploadToSignedUrl(signedUrl: string, data: ArrayBuffer, contentType: string) {
const res = await fetch(signedUrl, {
method: 'PUT',
headers: { 'content-type': contentType },
body: data,
});
//if (!res.ok) throw new Error(upload failed: ${res.status});
}
