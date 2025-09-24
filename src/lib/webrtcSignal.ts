import { supa } from './supabase';

export type SignalMessage =
| { kind: 'offer'; from: string; sdp: any }
| { kind: 'answer'; from: string; sdp: any }
| { kind: 'ice'; from: string; candidate: any };

export function openSignalChannel(camDeviceId: string) {
const topic = `webrtc:cam:${camDeviceId}`;
const channel = supa.channel(topic, { config: { broadcast: { ack: true } } });

let subscribed = false;

function subscribe(onMessage: (msg: SignalMessage) => void): Promise<void> {
return new Promise<void>((resolve) => {
channel.on('broadcast', { event: 'signal' }, (payload: any) => {
const msg = payload?.payload as SignalMessage;
if (msg && typeof msg === 'object' && 'kind' in msg) {
onMessage(msg);
}
});

  channel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      resolve();
    }
  });
});
}

async function ensureSubscribed() {
if (subscribed) return;
await new Promise<void>((resolve) => {
channel.subscribe((status: string) => {
if (status === 'SUBSCRIBED') {
subscribed = true;
resolve();
}
});
});
}

async function send(msg: SignalMessage): Promise<void> {
await ensureSubscribed();
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