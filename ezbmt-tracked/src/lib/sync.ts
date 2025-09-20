import { listSyncQueue, removeSyncItem, bumpSyncRetry } from '../db';
import { insertRally, insertChatMessage, insertMedia } from '../db'; // supabase 版
import { supa } from './supabase';
import { getSignedUploadUrl, uploadToSignedUrl, getPublicUrl } from './storage';

let timer: any = null;

export function startSyncLoop() {
if (timer) return;
timer = setInterval(runOnce, 10_000); // 每 10 秒
runOnce().catch(()=>{});
}
export function stopSyncLoop() { if (timer) { clearInterval(timer); timer = null; } }

async function runOnce() {
const { data } = await supa.auth.getUser();
if (!data?.user) return; // 未登入不送
const batch = await listSyncQueue(30);
for (const item of batch) {
try {
const payload = JSON.parse(item.payload_json || '{}');
await pushOne(item.kind, payload);
await removeSyncItem(item.id);
} catch (_e) {
await bumpSyncRetry(item.id);
// 可選: 若 retries 超過某值則丟棄或上報
}
}
}

async function pushOne(kind: string, payload: any) {
if (kind === 'rally') {
await insertRally(payload); // payload 需符合 supa.insertRally 的欄位
} else if (kind === 'chat') {
await insertChatMessage(payload);
} else if (kind === 'media') {
// payload: { matchId, local: { base64?:string, arrayBuffer?:ArrayBuffer }, mime, ext, description? }
const { matchId, base64, mime, ext, description } = payload;
const { path, signedUrl } = await getSignedUploadUrl(matchId, ext, mime);
const buf = base64ToArrayBuffer(base64 || '');
await uploadToSignedUrl(signedUrl, buf, mime);
const publicUrl = getPublicUrl(path);
await insertMedia({ owner_type:'match', owner_id:matchId, kind:'photo', url: publicUrl, description });
}
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
let str = b64.replace(/[^A-Za-z0-9+/=]/g, '');
let i = 0; let len = str.length; let bufferLength = len * 0.75;
if (str[str.length-1] === '=') bufferLength--;
if (str[str.length-2] === '=') bufferLength--;
const bytes = new Uint8Array(bufferLength);
while (i < len) {
const enc1 = chars.indexOf(str[i++]); const enc2 = chars.indexOf(str[i++]);
const enc3 = chars.indexOf(str[i++]); const enc4 = chars.indexOf(str[i++]);
const n = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);
bytes[(i/43)-3] = (n >> 16) & 255; if (enc3 !== 64) bytes[(i/43)-2] = (n >> 8) & 255; if (enc4 !== 64) bytes[(i/4*3)-1] = n & 255;
}
return bytes.buffer;
}

