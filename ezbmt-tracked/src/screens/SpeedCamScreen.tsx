import React from 'react';
import { View, Text, Pressable, Alert, Dimensions } from 'react-native';
import {
Camera,
useCameraDevice,
useFrameProcessor,
VisionCameraProxy,
type FrameProcessorPlugin,
} from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { insertSpeedSession, insertSpeedPoints } from '../db';

type Sample = { x: number; y: number; ts: number; score: number; w?: number; h?: number };
type Pt = { x: number; y: number };

export default function SpeedCamScreen() {
const device = useCameraDevice('back');

// 權限
const [hasPerm, setHasPerm] = React.useState(false);
React.useEffect(() => {
(async () => {
const cam = await Camera.requestCameraPermission();
setHasPerm(cam === 'granted');
})();
}, []);

// 即時速度
const [speedMs, setSpeedMs] = React.useState(0);
const updateSpeed = React.useCallback((msInst: number) => {
setSpeedMs((prev) => (prev === 0 ? msInst : prev * 0.7 + msInst * 0.3));
}, []);

// 上一筆樣本
const lastRef = React.useRef<Sample | null>(null);

// 校正
const [calibMode, setCalibMode] = React.useState(false);
const [calibA, setCalibA] = React.useState<Pt | null>(null);
const [calibB, setCalibB] = React.useState<Pt | null>(null);
const [metersPerUnit, setMetersPerUnit] = React.useState<number | null>(null);

// 視圖與幀尺寸
const [viewSize, setViewSize] = React.useState({
w: Dimensions.get('window').width,
h: Dimensions.get('window').height * 0.7,
});
const frameSizeRef = React.useRef<{ w: number; h: number } | null>(null);

// 錄製
const [recording, setRecording] = React.useState(false);
const recordBufRef = React.useRef<Array<{ idx: number; x: number; y: number; ts: number }>>([]);

// 取得原生 Frame Processor Plugin（相容多版本）
const speedPlugin = React.useMemo<FrameProcessorPlugin | undefined>(() => {
try {
const proxy: any = VisionCameraProxy as any;
const getter =
proxy?.getFrameProcessorPlugin /* VC v3/部分版本 / ??
proxy?.initFrameProcessorPlugin; / 你目前的版本 */
return typeof getter === 'function' ? getter('SpeedTracker') : undefined;
} catch {
return undefined;
}
}, []);

// 畫面點擊 -> 幀 normalized（0..1），含 aspectFill 修正
const toFrameNorm = React.useCallback(
(vx: number, vy: number): Pt | null => {
const fs = frameSizeRef.current;
if (!fs) return null;
const VW = viewSize.w, VH = viewSize.h;
const FW = fs.w, FH = fs.h;
if (!VW || !VH || !FW || !FH) return null;

  const scale = Math.max(VW / FW, VH / FH);
  const dispW = FW * scale, dispH = FH * scale;
  const offX = (dispW - VW) / 2;
  const offY = (dispH - VH) / 2;

  const fx = (vx + offX) / scale;
  const fy = (vy + offY) / scale;
  return { x: Math.min(1, Math.max(0, fx / FW)), y: Math.min(1, Math.max(0, fy / FH)) };
},
[viewSize],
);

// 點擊校正
const onTapOverlay = (evt: any) => {
if (!calibMode) return;
const { locationX, locationY } = evt.nativeEvent;
const p = toFrameNorm(locationX, locationY);
if (!p) { Alert.alert('等待相機幀尺寸…'); return; }
if (!calibA) setCalibA(p);
else if (!calibB) setCalibB(p);
else { setCalibA(p); setCalibB(null); }
};

const applyCalib = (knownMeters: number) => {
if (!calibA || !calibB) { Alert.alert('請在畫面上點兩點'); return; }
const du = Math.hypot(calibB.x - calibA.x, calibB.y - calibA.y);
if (du < 1e-4) { Alert.alert('兩點太近'); return; }
setMetersPerUnit(knownMeters / du);
setCalibMode(false);
};

// 錄製控制
const startRecord = () => {
recordBufRef.current = [];
setRecording(true);
};
const stopRecordAndSave = async () => {
setRecording(false);
const rows = recordBufRef.current.slice();
if (rows.length < 2) { Alert.alert('提示', '資料不足，未儲存'); return; }
try {
const sid = await insertSpeedSession('camera', 'kmh');
await insertSpeedPoints(
sid,
rows.map((r, i) => ({ idx: i, rx: r.x, ry: r.y, ts: Math.round(r.ts * 1000) })),
);
Alert.alert('已儲存', '共 ${rows.length} 筆！');
} catch (e: any) {
Alert.alert('儲存失敗', String(e?.message || e));
}
};

// JS 端樣本處理（一定要在 frameProcessor 前宣告）
const onSampleCalc = React.useCallback(
(s: Sample) => {
if (typeof s.w === 'number' && typeof s.h === 'number' && s.w > 0 && s.h > 0) {
frameSizeRef.current = { w: s.w, h: s.h };
}
const last = lastRef.current;
if (last && metersPerUnit != null) {
const dt = s.ts - last.ts;
if (dt > 0) {
const du = Math.hypot(s.x - last.x, s.y - last.y);
const meters = du * metersPerUnit;
const mps = meters / dt;
updateSpeed(mps);
}
}
lastRef.current = s;

  if (recording) {
    const buf = recordBufRef.current;
    buf.push({ idx: buf.length, x: s.x, y: s.y, ts: s.ts });
  }
},
[metersPerUnit, recording, updateSpeed],
);

// 唯一的 frameProcessor（從外層捕捉 speedPlugin）
const frameProcessor = useFrameProcessor(
(frame) => {
'worklet';

  // 30Hz 節流
  // @ts-ignore
  const last = globalThis.__lastFP || 0;
  const dt = frame.timestamp - last;
  if (dt < 1 / 30) return;
  // @ts-ignore
  globalThis.__lastFP = frame.timestamp;

  // 捕捉進來的 plugin（相容 .call 或直接呼叫）
  // @ts-ignore
  const p = speedPlugin as any;
  if (!p) return;
  // @ts-ignore
  const res = p.call ? p.call(frame, {}) : p(frame, {});
  if (!res) return;

  const s = {
    x: res.x as number,
    y: res.y as number,
    ts: res.ts as number,
    score: res.score as number,
    w: res.w as number,
    h: res.h as number,
  };
  if (s.score < 10) return;

  runOnJS(onSampleCalc)(s);
},
[onSampleCalc, speedPlugin],
);

if (!device)
return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>找不到可用相機</Text></View>;
if (!hasPerm)
return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>尚未取得相機權限</Text></View>;

const kmh = speedMs * 3.6;

return (
<View style={{ flex: 1 }}>
<Camera style={{ flex: 1 }} device={device} isActive frameProcessor={frameProcessor} />

  {/* 透明點擊層（校正用） */}
  <View
    onLayout={(e) => {
      const { width, height } = e.nativeEvent.layout;
      setViewSize({ w: width, h: height });
    }}
    onStartShouldSetResponder={() => true}
    onResponderRelease={onTapOverlay}
    pointerEvents="box-only"
    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
  />

  {/* UI 面板 */}
  <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 12 }}>
    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{kmh.toFixed(1)} km/h ({speedMs.toFixed(2)} m/s)</Text>
    <Text style={{ color: '#fff', marginTop: 4 }}>
      校正：{metersPerUnit ? `${metersPerUnit.toFixed(3)} m / normalized-unit` : '尚未校正'}
    </Text>

    <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
      <Pressable onPress={() => { setCalibMode((v) => !v); setCalibA(null); setCalibB(null); }}
        style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
        <Text style={{ color: '#fff' }}>{calibMode ? '退出校正' : '校正模式'}</Text>
      </Pressable>

      {calibMode && (
        <>
          <Pressable onPress={() => applyCalib(6.1)}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#2e7d32', borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: '#fff' }}>雙打寬 6.1m</Text>
          </Pressable>
          <Pressable onPress={() => applyCalib(5.18)}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#00796b', borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: '#fff' }}>單打寬 5.18m</Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={() => { setMetersPerUnit(null); setCalibA(null); setCalibB(null); }}
        style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#9e9e9e', borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
        <Text style={{ color: '#fff' }}>清除校正</Text>
      </Pressable>

      {!recording ? (
        <Pressable onPress={startRecord}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#e53935', borderRadius: 8, marginLeft: 8 }}>
          <Text style={{ color: '#fff' }}>開始錄製</Text>
        </Pressable>
      ) : (
        <Pressable onPress={stopRecordAndSave}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#8e24aa', borderRadius: 8, marginLeft: 8 }}>
          <Text style={{ color: '#fff' }}>停止並儲存</Text>
        </Pressable>
      )}
    </View>

    {calibMode && (
      <Text style={{ color: '#fff', marginTop: 6 }}>
        校正說明：在預覽畫面上點兩點（例如球場左右邊線），再點選 6.1m 或 5.18m。
      </Text>
    )}
  </View>
</View>
);
}

