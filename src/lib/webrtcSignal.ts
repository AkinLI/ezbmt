import { supa } from './supabase';

export type SignalMessage =
| { kind: 'offer'; from: string; sdp: any }
| { kind: 'answer'; from: string; sdp: any }
| { kind: 'ice'; from: string; candidate: any };

export function openSignalChannel(camDeviceId: string) {
const topic = `webrtc:cam:${camDeviceId}`;
// 若你的 supabase-js 版本支援 ack 設定可保留 config，否則可用最簡化版本：
const channel = supa.channel(topic);

function subscribe(onMessage: (msg: SignalMessage) => void) {
channel.on('broadcast', { event: 'signal' }, (payload: any) => {
const msg = payload?.payload as SignalMessage;
if (msg && typeof msg === 'object' && 'kind' in msg) {
onMessage(msg);
}
});
return channel.subscribe();
}

async function send(msg: SignalMessage): Promise<void> {
try {
await channel.send({ type: 'broadcast', event: 'signal', payload: msg });
} catch {
// ignore
}
}

async function close(): Promise<void> {
try {
await channel.unsubscribe();
} catch {
// ignore
}
}

return { subscribe, send, close, channel };
}