import React from 'react';
import {
View,
Text,
Pressable,
Alert,
Dimensions,
NativeSyntheticEvent,
TextInput,
LayoutChangeEvent,
} from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import RNSpeedCamView, { type NativeSample } from '../native/SpeedCamNative';
import { insertSpeedSession, insertSpeedPoints } from '../db';

type Pt = { x: number; y: number };

// ---------- RotBox：將內容順時針旋轉 90°（橫向顯示） ----------
function RotBox({
children,
style,
offset = { x: 0, y: 0 },
}: {
children: React.ReactNode;
style?: any;
offset?: { x: number; y: number };
}) {
const [box, setBox] = React.useState({ w: 0, h: 0 });
return (
<View
onLayout={(e) =>
setBox({
w: Math.round(e.nativeEvent.layout.width),
h: Math.round(e.nativeEvent.layout.height),
})
}
style={[
style,
{
transform: [
{ translateX: box.h + offset.x },
{ translateY: offset.y },
{ rotate: '90deg' },
],
},
]}
>
{children}
</View>
);
}

// -------------- Homography（四點透視變換）工具 --------------
function solveLinearSystem(A: number[][], b: number[]): number[] {
const n = A.length;
const M = A.map((row, i) => [...row, b[i]]);
for (let i = 0; i < n; i++) {
let maxRow = i;
for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
if (Math.abs(M[maxRow][i]) < 1e-12) throw new Error('Singular matrix');
if (maxRow !== i) { const t = M[i]; M[i] = M[maxRow]; M[maxRow] = t; }
const piv = M[i][i];
for (let c = i; c <= n; c++) M[i][c] /= piv;
for (let r = 0; r < n; r++) {
if (r === i) continue;
const f = M[r][i];
for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
}
}
return M.map(row => row[n]);
}

function computeHomography(
src: Array<{ x: number; y: number }>,
dst: Array<{ X: number; Y: number }>,
): number[] {
const A: number[][] = [];
const b: number[] = [];
for (let i = 0; i < 4; i++) {
const { x, y } = src[i];
const { X, Y } = dst[i];
A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
}
const h = solveLinearSystem(A, b);
return [...h, 1];
}
function applyHomography(H: number[], x: number, y: number): { X: number; Y: number } | null {
const d = H[6] * x + H[7] * y + 1;
if (Math.abs(d) < 1e-12) return null;
const X = (H[0] * x + H[1] * y + H[2]) / d;
const Y = (H[3] * x + H[4] * y + H[5]) / d;
return { X, Y };
}

// ------------------------------------------------------------

export default function SpeedCamScreen() {
// 權限（Info.plist 已有）
const [hasPerm] = React.useState(true);

// 即時速度（m/s）
const [speedMs, setSpeedMs] = React.useState(0);
const updateSpeed = React.useCallback((msInst: number) => {
setSpeedMs(prev => (prev === 0 ? msInst : prev * 0.7 + msInst * 0.3));
}, []);

// 上一筆樣本
const lastRef = React.useRef<NativeSample | null>(null);

// 透明層尺寸（供點擊座標轉 normalized）
const [viewSize, setViewSize] = React.useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height * 0.7 });
const frameSizeRef = React.useRef<{ w: number; h: number } | null>(null);

// 設定面板：可收納
const [panelOpen, setPanelOpen] = React.useState(true);

// 速度門檻（km/h，可調）
const [minKmhTxt, setMinKmhTxt] = React.useState('200');
const [maxKmhTxt, setMaxKmhTxt] = React.useState('500');
const minKmh = Math.max(0, Number(minKmhTxt) || 0);
const maxKmh = Math.max(minKmh, Number(maxKmhTxt) || 500);

// 二點寬度校正
const [calib2On, setCalib2On] = React.useState(false);
const [calibA, setCalibA] = React.useState<Pt | null>(null);
const [calibB, setCalibB] = React.useState<Pt | null>(null);
const [metersPerUnit, setMetersPerUnit] = React.useState<number | null>(null);

// 四點校正（優先）
const [calib4On, setCalib4On] = React.useState(false);
const [courtMode, setCourtMode] = React.useState<'doubles' | 'singles'>('doubles');
const [corners, setCorners] = React.useState<Pt[]>([]);
const [H, setH] = React.useState<number[] | null>(null);

// 原生過濾/追蹤門檻（亮度/彩度/區塊/ROI）
const [yMinTxt, setYMinTxt] = React.useState('150');
const [cMaxTxt, setCMaxTxt] = React.useState('20');
const [blkTxt, setBlkTxt]   = React.useState('8');
const [roiTxt, setRoiTxt]   = React.useState('64');
const yMinNum = Math.max(0, Math.min(255, Number(yMinTxt) || 0));
const cMaxNum = Math.max(0, Math.min(255, Number(cMaxTxt) || 0));
const blkNum  = Math.max(4, Number(blkTxt) || 8);
const roiNum  = Math.max(blkNum, Number(roiTxt) || 64);

// 錄製
const [recording, setRecording] = React.useState(false);
const recordBufRef = React.useRef<Array<{ idx: number; x: number; y: number; ts: number }>>([]);

// 追蹤軌跡（最近 1.5 秒）
const trailRef = React.useRef<Array<{ x: number; y: number; ts: number }>>([]);

// 幀座標轉 normalized（0..1），含 aspectFill 修正
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

// 點擊處理（同時支援 2 點/4 點校正）
const onTapOverlay = (evt: any) => {
const { locationX, locationY } = evt.nativeEvent;
const p = toFrameNorm(locationX, locationY);
if (!p) { Alert.alert('等待相機幀尺寸…'); return; }

if (calib4On) {
  const next = [...corners, p];
  if (next.length < 4) { setCorners(next); }
  else {
    const fs = frameSizeRef.current!;
    const srcPx = next.map(pt => ({ x: pt.x * fs.w, y: pt.y * fs.h }));
    const L = 13.4;
    const W = (courtMode === 'doubles') ? 6.1 : 5.18;
    try {
      const h = computeHomography(srcPx, [
        { X: 0, Y: 0 }, { X: W, Y: 0 }, { X: W, Y: L }, { X: 0, Y: L },
      ]);
      setH(h);
      setCorners(next);
      setCalib4On(false);
      Alert.alert('完成', '四點校正已建立');
    } catch {
      Alert.alert('失敗', '無法建立透視變換，請重試（確認四點順序與不共線）');
      setCorners([]); setH(null);
    }
  }
  return;
}

if (calib2On) {
  if (!calibA) setCalibA(p);
  else if (!calibB) setCalibB(p);
  else { setCalibA(p); setCalibB(null); }
}
};

const applyCalib2 = (knownMeters: number) => {
if (!calibA || !calibB) { Alert.alert('請先點兩點'); return; }
const du = Math.hypot(calibB.x - calibA.x, calibB.y - calibA.y);
if (du < 1e-4) { Alert.alert('兩點太近'); return; }
setMetersPerUnit(knownMeters / du);
setCalib2On(false);
};

const clearAllCalib = () => {
setMetersPerUnit(null);
setCalibA(null); setCalibB(null);
setH(null); setCorners([]); setCalib4On(false);
};

const startRecord = () => { recordBufRef.current = []; setRecording(true); };
const stopRecordAndSave = async () => {
setRecording(false);
const rows = recordBufRef.current.slice();
if (rows.length < 2) { Alert.alert('提示', '資料不足，未儲存'); return; }
try {
const sid = await insertSpeedSession('camera', 'kmh');
await insertSpeedPoints(
sid,
rows.map((r, i) => ({ idx: i, rx: r.x, ry: r.y, ts: Math.round(r.ts) })),
);
Alert.alert('已儲存', `共 ${rows.length} 筆！`);
} catch (e: any) {
Alert.alert('儲存失敗', String(e?.message || e));
}
};

const onSample = React.useCallback((e: NativeSyntheticEvent<NativeSample>) => {
const s = e.nativeEvent;
if (s.w && s.h) frameSizeRef.current = { w: s.w, h: s.h };

const last = lastRef.current;
if (!last) { lastRef.current = s; return; }

const dtSec = (s.ts - last.ts) / 1000;
if (dtSec <= 0.005 || dtSec > 0.5) { lastRef.current = s; return; }

let mps: number | null = null;
if (H && frameSizeRef.current) {
  const fs = frameSizeRef.current;
  const a = applyHomography(H, last.x * fs.w, last.y * fs.h);
  const b = applyHomography(H, s.x * fs.w, s.y * fs.h);
  if (a && b) {
    const meters = Math.hypot(b.X - a.X, b.Y - a.Y);
    mps = meters / dtSec;
  }
} else if (metersPerUnit != null) {
  const du = Math.hypot(s.x - last.x, s.y - last.y);
  const meters = du * metersPerUnit;
  mps = meters / dtSec;
}

if (mps != null && Number.isFinite(mps) && mps > 0) {
  const minMps = (minKmh / 3.6), maxMps = (maxKmh / 3.6);
  if (mps >= minMps && mps <= maxMps) {
    updateSpeed(mps);
    // 軌跡（最近 1.5 秒）
    const now = s.ts;
    trailRef.current.push({ x: s.x, y: s.y, ts: now });
    trailRef.current = trailRef.current.filter(p => (now - p.ts) <= 1500);

    if (recording) {
      recordBufRef.current.push({ idx: recordBufRef.current.length, x: s.x, y: s.y, ts: s.ts });
    }
  }
}
lastRef.current = s;
}, [H, metersPerUnit, minKmh, maxKmh, recording, updateSpeed]);

const kmh = speedMs * 3.6;

const onOverlayLayout = (e: LayoutChangeEvent) => {
const { width, height } = e.nativeEvent.layout;
setViewSize({ w: width, h: height });
};

if (!hasPerm)
return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>尚未取得相機權限</Text></View>;

return (
<View style={{ flex: 1, backgroundColor: '#000' }}>
{/* 相機預覽 */}
<RNSpeedCamView
style={{ flex: 1 }}
isActive={true}
onSample={onSample}
yMin={yMinNum}
chromaMax={cMaxNum}
blockSize={blkNum}
roiPad={roiNum}
/>

  {/* 透明點擊層（校正點） */}
  <View
    onLayout={onOverlayLayout}
    onStartShouldSetResponder={() => true}
    onResponderRelease={onTapOverlay}
    pointerEvents="box-only"
    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
  />

  {/* 軌跡繪製（最近 1.5 秒） */}
  <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
    <Svg width={viewSize.w} height={viewSize.h}>
      <Polyline
        points={trailRef.current.map(p => `${p.x * viewSize.w},${p.y * viewSize.h}`).join(' ')}
        stroke="#00e5ff" strokeWidth={3} fill="none" opacity={0.85}
      />
      {trailRef.current.length > 0 && (
        <Circle
          cx={trailRef.current[trailRef.current.length - 1].x * viewSize.w}
          cy={trailRef.current[trailRef.current.length - 1].y * viewSize.h}
          r={6} fill="#00e5ff"
        />
      )}
    </Svg>
  </View>

  {/* 速度顯示（橫向） */}
  <View style={{ position: 'absolute', right: 0, top: 75 }}>
    <RotBox>
      <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
          {H || metersPerUnit ? `${kmh.toFixed(1)} km/h (${speedMs.toFixed(2)} m/s)` : '尚未校正'}
        </Text>
      </View>
    </RotBox>
  </View>

  {/* 設定面板開關（橫向） */}
  <View style={{ position: 'absolute', right: 10, top: 350 }}>
    <RotBox>
      <Pressable
        onPress={() => setPanelOpen(o => !o)}
        style={{ backgroundColor: panelOpen ? '#455a64' : '#1976d2', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
      >
        <Text style={{ color: '#fff' }}>{panelOpen ? '收合設定' : '展開設定'}</Text>
      </Pressable>
    </RotBox>
  </View>

  {/* 設定面板（橫向，可收納） */}
  {panelOpen && (
    <View style={{ position: 'absolute', right: 400, bottom: 50 }}>
      <RotBox>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 12, minWidth: 300 }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>設定</Text>

          {/* 速度門檻 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#fff', marginRight: 8 }}>速度門檻（km/h）：</Text>
            <TextInput
              value={minKmhTxt} onChangeText={setMinKmhTxt} keyboardType="numeric"
              placeholder="min" placeholderTextColor="#aaa"
              style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8, marginRight: 6 }}
            />
            <Text style={{ color: '#fff', marginHorizontal: 4 }}>~</Text>
            <TextInput
              value={maxKmhTxt} onChangeText={setMaxKmhTxt} keyboardType="numeric"
              placeholder="max" placeholderTextColor="#aaa"
              style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8 }}
            />
          </View>

          {/* 原生白球過濾/追蹤門檻 */}
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>白球過濾/追蹤</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: '#fff', width: 90 }}>亮度 yMin</Text>
              <TextInput
                value={yMinTxt} onChangeText={setYMinTxt} keyboardType="numeric"
                placeholder="150" placeholderTextColor="#aaa"
                style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8 }}
              />
              <Text style={{ color: '#fff', marginLeft: 12, width: 90 }}>彩度 cMax</Text>
              <TextInput
                value={cMaxTxt} onChangeText={setCMaxTxt} keyboardType="numeric"
                placeholder="20" placeholderTextColor="#aaa"
                style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8 }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', width: 90 }}>區塊 block</Text>
              <TextInput
                value={blkTxt} onChangeText={setBlkTxt} keyboardType="numeric"
                placeholder="8" placeholderTextColor="#aaa"
                style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8 }}
              />
              <Text style={{ color: '#fff', marginLeft: 12, width: 90 }}>ROI 半徑</Text>
              <TextInput
                value={roiTxt} onChangeText={setRoiTxt} keyboardType="numeric"
                placeholder="64" placeholderTextColor="#aaa"
                style={{ width: 80, height: 36, borderWidth: 1, borderColor: '#777', borderRadius: 6, color: '#fff', paddingHorizontal: 8 }}
              />
            </View>
          </View>

          {/* 四點校正（優先） */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>四點校正</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Pressable
                onPress={() => { setCalib4On(true); setCorners([]); setH(null); setCalib2On(false); }}
                style={{ backgroundColor: '#1976d2', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 8 }}
              >
                <Text style={{ color: '#fff' }}>{calib4On ? '點四角：進行中…' : '開始點四角'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setCourtMode(m => m === 'doubles' ? 'singles' : 'doubles')}
                style={{ backgroundColor: '#455a64', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
              >
                <Text style={{ color: '#fff' }}>{courtMode === 'doubles' ? '模式：雙打 6.1×13.4' : '模式：單打 5.18×13.4'}</Text>
              </Pressable>
            </View>
            {!!corners.length && (
              <Text style={{ color: '#ddd', marginBottom: 6 }}>已點 {corners.length}/4（順序：上左→上右→下右→下左）</Text>
            )}
            {!!H && <Text style={{ color: '#90caf9' }}>已使用四點校正（更精準）</Text>}
          </View>

          {/* 二點校正（快速/備用） */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>二點寬度校正</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Pressable
                onPress={() => { setCalib2On(true); setCalibA(null); setCalibB(null); setMetersPerUnit(null); setCalib4On(false); }}
                style={{ backgroundColor: '#1976d2', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 8 }}
              >
                <Text style={{ color: '#fff' }}>{calib2On ? '點兩點：進行中…' : '開始點兩點'}</Text>
              </Pressable>
              <Pressable onPress={() => applyCalib2(6.1)} style={{ backgroundColor: '#2e7d32', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 8 }}>
                <Text style={{ color: '#fff' }}>雙打寬 6.1m</Text>
              </Pressable>
              <Pressable onPress={() => applyCalib2(5.18)} style={{ backgroundColor: '#00796b', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}>
                <Text style={{ color: '#fff' }}>單打寬 5.18m</Text>
              </Pressable>
            </View>
            {!!metersPerUnit && <Text style={{ color: '#90caf9' }}>二點比例：{metersPerUnit.toFixed(3)} m / unit</Text>}
          </View>

          {/* 錄製 */}
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            {!recording ? (
              <Pressable onPress={startRecord} style={{ backgroundColor: '#e53935', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 }}>
                <Text style={{ color: '#fff' }}>開始錄製</Text>
              </Pressable>
            ) : (
              <Pressable onPress={stopRecordAndSave} style={{ backgroundColor: '#8e24aa', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 }}>
                <Text style={{ color: '#fff' }}>停止並儲存</Text>
              </Pressable>
            )}
            <Pressable onPress={clearAllCalib} style={{ backgroundColor: '#9e9e9e', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
              <Text style={{ color: '#fff' }}>清除校正</Text>
            </Pressable>
          </View>
        </View>
      </RotBox>
    </View>
  )}
</View>
);
}