import React from 'react';
import {
View,
Text,
Pressable,
ActivityIndicator,
Alert,
TextInput,
FlatList,
Switch,
PermissionsAndroid,
Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import KeepAwake from 'react-native-keep-awake';
import { useNavigation } from '@react-navigation/native';
import { supa } from '../lib/supabase';
import { getDeviceId, getPlatformTag } from '../lib/deviceId';
import { openSignalChannel } from '../lib/webrtcSignal';
import {
RTCPeerConnection,
mediaDevices,
RTCView,
RTCSessionDescription,
RTCIceCandidate,
} from 'react-native-webrtc';

const C = {
bg: '#111',
card: '#1e1e1e',
border: '#333',
text: '#fff',
sub: '#bbb',
btn: '#1976d2',
warn: '#d32f2f',
chip: '#90caf9',
gray: '#616161',
};

type CamRow = {
device_id: string;
owner_id: string;
name?: string | null;
platform?: string | null;
status?: 'online' | 'offline' | string | null;
last_seen_at?: string | null;
};

const ICE_SERVERS = {
iceServers: [
{ urls: ['stun:stun.l.google.com:19302',
'stun:stun1.l.google.com:19302',
'stun:stun2.l.google.com:19302',
'stun:stun3.l.google.com:19302',
'stun:stun4.l.google.com:19302'] },
],
};

const AUTO_KEY = 'webcam:autoBroadcast';

export default function WebCamScreen() {
const navigation = useNavigation<any>();

const [uid, setUid] = React.useState<string>('');
const [loading, setLoading] = React.useState(true);

const [deviceId, setDeviceId] = React.useState<string>('');
const [myName, setMyName] = React.useState<string>('');
const [advertise, setAdvertise] = React.useState(false);
const hbRef = React.useRef<null | (() => void)>(null);

const [list, setList] = React.useState<CamRow[]>([]);
const [busyRename, setBusyRename] = React.useState(false);
const [listLoading, setListLoading] = React.useState(false);

// WebRTC：廣播端狀態
const pcRef = React.useRef<RTCPeerConnection | null>(null);
const localStreamRef = React.useRef<any>(null);
const signalRef = React.useRef<ReturnType<typeof openSignalChannel> | null>(null);
const [previewOn, setPreviewOn] = React.useState(false);

React.useEffect(() => {
let active = true;
(async () => {
try {
const { data: admin } = await supa.rpc('is_app_admin');
if (!admin) throw new Error('not_admin');
const { data } = await supa.auth.getUser();
const u = data?.user?.id;
if (!u) throw new Error('no_login');
if (!active) return;
setUid(u);

    const id = await getDeviceId();
    if (!active) return;
    setDeviceId(id);
    setMyName(`Cam-${getPlatformTag()}-${id.slice(0, 4)}`);

    // 自動廣播偏好：若為開則自動啟動
    try {
      const pref = await AsyncStorage.getItem(AUTO_KEY);
      if (pref === '1') {
        setAdvertise(true);
        await startHeartbeat();
        await startBroadcast();
      }
    } catch {}

    await reload(u);
  } catch (e: any) {
    Alert.alert('無法進入', '此功能僅供最大管理者使用或尚未登入。');
  } finally {
    if (active) setLoading(false);
  }
})();
return () => {
  active = false;
  stopHeartbeat();
  stopBroadcast();
  try { KeepAwake.deactivate(); } catch {}
};
}, []);

// 廣播中 → 常亮
React.useEffect(() => {
try {
if (advertise) KeepAwake.activate();
else KeepAwake.deactivate();
} catch {}
return () => { try { KeepAwake.deactivate(); } catch {} };
}, [advertise]);

async function ensureAVPermission() {
if (Platform.OS === 'android') {
const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
if (cam !== PermissionsAndroid.RESULTS.GRANTED || mic !== PermissionsAndroid.RESULTS.GRANTED) {
throw new Error('CAMERA/MIC permission denied');
}
}
// iOS: Info.plist 需有相機/麥克風描述，首次會彈窗
}

async function reload(ownerId?: string) {
try {
setListLoading(true);
const { data, error } = await supa
.from('user_cams')
.select('device_id,owner_id,name,platform,status,last_seen_at')
.eq('owner_id', ownerId || uid)
.order('last_seen_at', { ascending: false })
.limit(200);
if (error) throw error;
setList(data || []);
const self = (data || []).find((r: any) => r.device_id === deviceId);
if (self && self.name && String(self.name).trim()) setMyName(String(self.name));
} catch (e: any) {
Alert.alert('載入失敗', String(e?.message || e));
} finally {
setListLoading(false);
}
}

function stopHeartbeat() {
try { hbRef.current?.(); } catch {}
hbRef.current = null;
}

async function startHeartbeat() {
stopHeartbeat();
const tick = async () => {
try {
await supa.from('user_cams').upsert({
device_id: deviceId,
owner_id: uid,
name: myName.trim() || `Cam-${getPlatformTag()}-${deviceId.slice(0, 4)}`,
platform: getPlatformTag(),
status: 'online',
last_seen_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
});
} catch {}
};
await tick().catch(() => {});
const timer = setInterval(() => tick().catch(() => {}), 15_000);
hbRef.current = () => clearInterval(timer);
}

async function startBroadcast() {
try {
await ensureAVPermission();

  // 1) local stream
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: { facingMode: 'environment', frameRate: 30, width: 640, height: 480 },
  });
  localStreamRef.current = stream;
  setPreviewOn(true);

  // 2) RTCPeerConnection
  const pc = new RTCPeerConnection(ICE_SERVERS);
  pcRef.current = pc;

  // Debug logs
  (pc as any).oniceconnectionstatechange = () => {
    console.log('[BROADCAST][ICE] state =', pc.iceConnectionState);
  };
  (pc as any).onconnectionstatechange = () => {
    console.log('[BROADCAST][PC] state =', pc.connectionState);
  };
  (pc as any).onicegatheringstatechange = () => {
    console.log('[BROADCAST][ICE] gathering =', pc.iceGatheringState);
  };

  // 3) 加入 tracks
  stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

  // 4) Signaling
  const signal = openSignalChannel(deviceId);
  signalRef.current = signal;

  (pc as any).onicecandidate = (ev: any) => {
    if (ev?.candidate) {
      console.log('[BROADCAST][ICE] send cand');
      signal.send({ kind: 'ice', from: deviceId, candidate: ev.candidate }).catch(() => {});
    } else {
      console.log('[BROADCAST][ICE] cand = null (completed)');
    }
  };

  await signal.subscribe(async (msg) => {
    try {
      if (!pcRef.current) return;
      if (msg.kind === 'offer' && msg.sdp) {
        console.log('[BROADCAST] recv offer');
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        console.log('[BROADCAST] send answer');
        await signal.send({ kind: 'answer', from: deviceId, sdp: answer });
      } else if (msg.kind === 'ice' && msg.candidate) {
        console.log('[BROADCAST] recv cand');
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
      }
    } catch (e) {
      console.log('[BROADCAST] signal error', e);
    }
  });
} catch (e: any) {
  Alert.alert('串流啟動失敗', String(e?.message || e));
  stopBroadcast();
  try { await AsyncStorage.setItem(AUTO_KEY, '0'); } catch {}
  setAdvertise(false);
}
}

function stopBroadcast() {
try { signalRef.current?.close(); } catch {}
signalRef.current = null;
try { pcRef.current?.close(); } catch {}
pcRef.current = null;
try {
const s = localStreamRef.current;
if (s) s.getTracks().forEach((t: any) => t.stop?.());
} catch {}
localStreamRef.current = null;
setPreviewOn(false);
}

async function toggleAdvertise(on: boolean) {
setAdvertise(on);
try { await AsyncStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch {}
if (on) {
await startHeartbeat();
await startBroadcast();
} else {
stopHeartbeat();
stopBroadcast();
try {
await supa.from('user_cams').upsert({
device_id: deviceId,
owner_id: uid,
name: myName.trim() || `Cam-${getPlatformTag()}-${deviceId.slice(0, 4)}`,
platform: getPlatformTag(),
status: 'offline',
last_seen_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
});
} catch {}
reload().catch(() => {});
}
}

async function saveName() {
const nm = myName.trim();
if (!nm) return;
setBusyRename(true);
try {
await supa.from('user_cams').upsert({
device_id: deviceId,
owner_id: uid,
name: nm,
platform: getPlatformTag(),
status: advertise ? 'online' : 'offline',
last_seen_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
});
await reload();
Alert.alert('成功', '已更新名稱');
} catch (e: any) {
Alert.alert('失敗', String(e?.message || e));
} finally {
setBusyRename(false);
}
}

const Item = ({ item }: { item: CamRow }) => {
const online =
String(item.status || '') === 'online' &&
(item.last_seen_at ? Date.now() - new Date(item.last_seen_at).getTime() < 60_000 : false);

const onWatch = () => {
  navigation.navigate('WebCamViewer', {
    deviceId: item.device_id,
    name: item.name || item.device_id.slice(0, 8) + '…',
    online,
    lastSeenAt: item.last_seen_at || null,
  });
};

return (
  <View style={{ padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 8, marginBottom: 8 }}>
    <Text style={{ color: '#fff', fontWeight: '700' }}>
      {item.name || item.device_id.slice(0, 8) + '…'}
    </Text>
    <Text style={{ color: '#ccc', marginTop: 4 }}>裝置：{item.device_id}</Text>
    <Text style={{ color: '#ccc', marginTop: 4 }}>平台：{item.platform || '-'}</Text>
    <Text style={{ color: online ? '#90caf9' : '#bbb', marginTop: 4 }}>
      狀態：{online ? 'online' : 'offline'}
      {!!item.last_seen_at && ` · ${new Date(item.last_seen_at).toLocaleString()}`}
    </Text>
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      <Pressable
        onPress={onWatch}
        disabled={!online}
        style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: online ? C.btn : '#555', marginRight: 8 }}
      >
        <Text style={{ color: '#fff' }}>觀看</Text>
      </Pressable>
    </View>
  </View>
);
};

if (loading) {
return (
<View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
<ActivityIndicator color="#90caf9" />
</View>
);
}

return (
<View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
<Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>
WEB CAM（我的裝置）
</Text>

  {previewOn && localStreamRef.current ? (
    <View style={{ height: 220, marginBottom: 10, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
      <RTCView streamURL={localStreamRef.current.toURL()} mirror={false} style={{ flex: 1, backgroundColor: '#000' }} objectFit="cover" />
    </View>
  ) : null}

  <View style={{ padding: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10, marginBottom: 12 }}>
    <Text style={{ color: '#fff', fontWeight: '700' }}>這台裝置</Text>
    <Text style={{ color: '#bbb', marginTop: 6 }}>Device ID：{deviceId}</Text>

    <View style={{ marginTop: 10 }}>
      <Text style={{ color: '#bbb', marginBottom: 6 }}>名稱</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          value={myName}
          onChangeText={setMyName}
          placeholder="裝置名稱"
          placeholderTextColor="#888"
          style={{ flex: 1, height: 40, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, color: '#fff', backgroundColor: '#111' }}
        />
        <Pressable onPress={saveName} disabled={busyRename} style={{ marginLeft: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: busyRename ? '#555' : C.btn, borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>{busyRename ? '儲存中…' : '儲存'}</Text>
        </Pressable>
      </View>
    </View>

    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
      <Text style={{ color: '#fff', marginRight: 8 }}>廣播中</Text>
      <Switch value={advertise} onValueChange={toggleAdvertise} />
      <Text style={{ color: '#888', marginLeft: 8 }}>（開啟後會記住，下次打開 App 自動開始廣播）</Text>
    </View>

    <View style={{ marginTop: 8 }}>
      <Text style={{ color: '#ffecb3' }}>注意：iOS/Android 都無法在背景或螢幕關閉時持續使用相機。請讓此畫面保持在前景；已啟用「螢幕常亮」避免裝置自動鎖定。</Text>
    </View>
  </View>

  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
    <Text style={{ color: '#fff', fontWeight: '700' }}>我的 cams</Text>
    <Pressable onPress={() => reload()} style={{ marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.btn, borderRadius: 8 }}>
      <Text style={{ color: '#fff' }}>{listLoading ? '更新中…' : '重新整理'}</Text>
    </Pressable>
  </View>
  {listLoading ? (
    <View style={{ padding: 16, alignItems: 'center' }}>
      <ActivityIndicator color="#90caf9" />
    </View>
  ) : (
    <FlatList data={list} keyExtractor={(i) => i.device_id} renderItem={({ item }) => <Item item={item} />} ListEmptyComponent={<Text style={{ color: C.sub }}>目前沒有已登記的裝置</Text>} />
  )}
</View>
);
}