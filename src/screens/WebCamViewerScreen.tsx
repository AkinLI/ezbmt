import React from 'react';
import {
View,
Text,
Pressable,
Alert,
ActivityIndicator,
} from 'react-native';
import KeepAwake from 'react-native-keep-awake';
import { useRoute } from '@react-navigation/native';
import { openSignalChannel } from '../lib/webrtcSignal';
import {
RTCPeerConnection,
RTCView,
RTCSessionDescription,
RTCIceCandidate,
MediaStream,
} from 'react-native-webrtc';

const C = { bg: '#111', card: '#1e1e1e', border: '#333', text: '#fff', sub: '#bbb', btn: '#1976d2', warn: '#d32f2f' };
const ICE_SERVERS = {
iceServers: [
{ urls: ['stun:stun.l.google.com:19302'] },
// 建議配置 TURN 伺服器
],
};

export default function WebCamViewerScreen() {
const route = useRoute<any>();
const deviceId = route.params?.deviceId as string | undefined;
const displayName = route.params?.name as string | undefined;
const onlineInit = !!route.params?.online;

const [connecting, setConnecting] = React.useState(false);
const [connected, setConnected] = React.useState(false);
const [status] = React.useState(onlineInit ? 'online' : 'offline');
const [remoteStream, setRemoteStream] = React.useState<any>(null);

const pcRef = React.useRef<RTCPeerConnection | null>(null);
const signalRef = React.useRef<ReturnType<typeof openSignalChannel> | null>(null);

React.useEffect(() => {
// 觀看中（連線中/已連線）保持常亮
const on = connecting || connected || !!remoteStream;
try { if (on) KeepAwake.activate(); else KeepAwake.deactivate(); } catch {}
return () => { try { KeepAwake.deactivate(); } catch {} };
}, [connecting, connected, remoteStream]);

React.useEffect(() => {
return () => {
cleanup();
try { KeepAwake.deactivate(); } catch {}
};
}, []);

function cleanup() {
try { signalRef.current?.close(); } catch {}
signalRef.current = null;
try { pcRef.current?.close(); } catch {}
pcRef.current = null;
try { setRemoteStream(null); } catch {}
setConnected(false);
setConnecting(false);
}

async function connect() {
if (!deviceId) return;
cleanup();
setConnecting(true);
try {
const pc = new RTCPeerConnection(ICE_SERVERS);
pcRef.current = pc;

  (pc as any).onicecandidate = (ev: any) => {
    if (ev?.candidate) {
      signalRef.current?.send({ kind: 'ice', from: 'viewer', candidate: ev.candidate });
    }
  };
  (pc as any).onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') setConnected(true);
    if (s === 'failed' || s === 'disconnected' || s === 'closed') setConnected(false);
  };
  (pc as any).ontrack = (ev: any) => {
    let s = ev?.streams && ev.streams[0];
    if (!s && ev?.track) {
      const ms = new MediaStream();
      ms.addTrack(ev.track);
      s = ms;
    }
    if (s) setRemoteStream(s);
  };
  (pc as any).onaddstream = (ev: any) => {
    if (ev?.stream) setRemoteStream(ev.stream);
  };

  const signal = openSignalChannel(deviceId);
  signalRef.current = signal;

  await signal.subscribe(async (msg) => {
    try {
      if (!pcRef.current) return;
      if (msg.kind === 'answer' && msg.sdp) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.kind === 'ice' && msg.candidate) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
      }
    } catch {}
  });

  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  await signal.send({ kind: 'offer', from: 'viewer', sdp: offer });
} catch (e: any) {
  Alert.alert('連線失敗', String(e?.message || e));
  cleanup();
} finally {
  setConnecting(false);
}
}

const canConnect = status === 'online' || onlineInit;

return (
<View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
<Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>
觀看：{displayName || (deviceId ? deviceId.slice(0, 8) + '…' : '')}
</Text>

  <View style={{ padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10, marginBottom: 10 }}>
    <Text style={{ color: C.text }}>Device ID：{deviceId || '-'}</Text>
    <Text style={{ color: canConnect ? '#90caf9' : '#bbb', marginTop: 6 }}>
      狀態：{canConnect ? 'online' : 'offline'}
    </Text>
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      <Pressable
        onPress={connect}
        disabled={!canConnect || connecting}
        style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: !canConnect || connecting ? '#555' : C.btn }}
      >
        <Text style={{ color: '#fff' }}>{connecting ? '連線中…' : '連線'}</Text>
      </Pressable>
      <Pressable
        onPress={cleanup}
        style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.warn, marginLeft: 8 }}
      >
        <Text style={{ color: '#fff' }}>中斷</Text>
      </Pressable>
    </View>
  </View>

  <View style={{ padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10, flex: 1 }}>
    <Text style={{ color: C.text, fontWeight: '700' }}>串流預覽</Text>
    {!remoteStream ? (
      <Text style={{ color: C.sub, marginTop: 8 }}>
        {canConnect ? '按「連線」開始接收影像' : '廣播端未上線或未廣播中'}
      </Text>
    ) : (
      <View style={{ flex: 1, marginTop: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
        <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1, backgroundColor: '#000' }} objectFit="cover" />
      </View>
    )}
  </View>
</View>
);
}