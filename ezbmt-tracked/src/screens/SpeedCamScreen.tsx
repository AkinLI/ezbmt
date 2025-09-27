import React from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  LayoutChangeEvent,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Circle } from 'react-native-svg';
import RNSpeedCamView, { type NativeSample } from '../native/SpeedCamNative';
import { insertSpeedSession, insertSpeedPoints } from '../db';

type Pt = { x: number; y: number };
type Unit = 'kmh' | 'mph';

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
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
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
    for (let r = i + 1; r < n; r++)
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    if (Math.abs(M[maxRow][i]) < 1e-12) throw new Error('Singular matrix');
    if (maxRow !== i) {
      const t = M[i];
      M[i] = M[maxRow];
      M[maxRow] = t;
    }
    const piv = M[i][i];
    for (let c = i; c <= n; c++) M[i][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
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
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinearSystem(A, b);
  return [...h, 1];
}
function applyHomography(
  H: number[],
  x: number,
  y: number,
): { X: number; Y: number } | null {
  const d = H[6] * x + H[7] * y + 1;
  if (Math.abs(d) < 1e-12) return null;
  const X = (H[0] * x + H[1] * y + H[2]) / d;
  const Y = (H[3] * x + H[4] * y + H[5]) / d;
  return { X, Y };
}

// ---------------- 座標映射（關鍵修正） ----------------
type MapVars = {
  VW: number; VH: number; // view size
  FW: number; FH: number; // frame size (from sample)
  scale: number;
  offX: number;
  offY: number;
  rotated: boolean; // 幀為橫向且 View 為直向 → 需要 90° 補償
};

// 計算 aspectFill 對應的 scale/off 並偵測是否要旋轉補償
function getMapVars(view: { w: number; h: number }, frame: { w: number; h: number } | null): MapVars | null {
  if (!frame) return null;
  const VW = view.w, VH = view.h;
  const FW = frame.w, FH = frame.h;
  if (!(VW && VH && FW && FH)) return null;

  // 預設：我們的預覽是 resizeAspectFill
  const scale = Math.max(VW / FW, VH / FH);
  const dispW = FW * scale;
  const dispH = FH * scale;
  const offX = (dispW - VW) / 2;
  const offY = (dispH - VH) / 2;

  // 旋轉補償：若幀為橫向、View 為直向 → 多半是 90 度
  const frameLandscape = FW > FH;
  const viewPortrait = VH > VW;
  const rotated = frameLandscape && viewPortrait;

  return { VW, VH, FW, FH, scale, offX, offY, rotated };
}

// View → Frame normalized
function viewToFrameNorm(vx: number, vy: number, mv: MapVars): Pt {
  // 先轉到「縮放後影像座標」
  const ix = (vx + mv.offX) / mv.scale; // in frame px
  const iy = (vy + mv.offY) / mv.scale;

  // 轉 normalized（未旋轉）
  let fx = ix / mv.FW;
  let fy = iy / mv.FH;

  // 如需補償旋轉（View portrait / Frame landscape）
  if (mv.rotated) {
    // 逆時針 ↔ 順時針的實務差異在不同機型上會不同
    // 這裡採用：畫面已被旋到直向，反推回 frame：view(x,y) → frame(u,v)
    // 以「向右 90°」來還原： fx' = fy, fy' = 1 - fx
    const rx = fy;
    const ry = 1 - fx;
    fx = rx; fy = ry;
  }

  // clamp
  fx = Math.min(1, Math.max(0, fx));
  fy = Math.min(1, Math.max(0, fy));
  return { x: fx, y: fy };
}

// Frame normalized → View（反變換）
function frameNormToView(fx: number, fy: number, mv: MapVars): { x: number; y: number } {
  // 還原旋轉對映
  let fxRaw = fx;
  let fyRaw = fy;
  if (mv.rotated) {
    // 反向於上式： fx' = 1 - fy, fy' = fx
    const ix = 1 - fyRaw;
    const iy = fxRaw;
    fxRaw = ix;
    fyRaw = iy;
  }

  // 轉到縮放後影像座標（px）
  const ix = fxRaw * mv.FW;
  const iy = fyRaw * mv.FH;

  // 轉回到 View（扣掉裁切 + 乘回 scale）
  const vx = ix * mv.scale - mv.offX;
  const vy = iy * mv.scale - mv.offY;
  return { x: vx, y: vy };
}

// ------------------------------------------------------------
const PREF_KEY = 'speedcam:prefs:v1';

export default function SpeedCamScreen() {
  // 權限（Info.plist 已有）
  const [hasPerm] = React.useState(true);

  // 即時速度（m/s）
  const [speedMs, setSpeedMs] = React.useState(0);

  // 單位/平滑/最大值暫留（預設值）
  const [unit, setUnit] = React.useState<Unit>('kmh'); // kmh/mph
  const [alpha, setAlpha] = React.useState(0.3);        // 0.05~0.6
  const [holdMs, setHoldMs] = React.useState(800);      // 0~2000 ms

  // 平均速度（簡單 EMA）
  const [avgMs, setAvgMs] = React.useState(0);
  const maxHoldRef = React.useRef<{ v: number; until: number }>({
    v: 0,
    until: 0,
  });

  const msToUnit = React.useCallback(
    (mps: number) => (unit === 'kmh' ? mps * 3.6 : mps * 2.2369362921),
    [unit],
  );

  const updateSpeed = React.useCallback(
    (msInst: number) => {
      const a = Math.min(0.99, Math.max(0.01, alpha));
      setSpeedMs((prev) => (prev === 0 ? msInst : prev * (1 - a) + msInst * a));
      setAvgMs((prev) => (prev === 0 ? msInst : prev * 0.98 + msInst * 0.02));
    },
    [alpha],
  );

  // 上一筆樣本
  const lastRef = React.useRef<NativeSample | null>(null);

  // View 尺寸（透明層）
  const [viewSize, setViewSize] = React.useState({
    w: Dimensions.get('window').width,
    h: Dimensions.get('window').height * 0.7,
  });

  // Frame 尺寸（由 sample 提供）
  const frameSizeRef = React.useRef<{ w: number; h: number } | null>(null);

  // 設定面板：可收納
  const [panelOpen, setPanelOpen] = React.useState(true);

  // 速度門檻（固定使用 km/h 表示）
  const [minKmh, setMinKmh] = React.useState(200); // 50~300
  const [maxKmh, setMaxKmh] = React.useState(500); // 200~600

  // 二點寬度校正
  const [calib2On, setCalib2On] = React.useState(false);
  const [calibA, setCalibA] = React.useState<Pt | null>(null); // frame normalized
  const [calibB, setCalibB] = React.useState<Pt | null>(null);
  const [metersPerUnit, setMetersPerUnit] = React.useState<number | null>(null);

  // 四點校正（優先）
  const [calib4On, setCalib4On] = React.useState(false);
  const [courtMode, setCourtMode] = React.useState<'doubles' | 'singles'>(
    'doubles',
  );
  const [corners, setCorners] = React.useState<Pt[]>([]); // frame normalized
  const [H, setH] = React.useState<number[] | null>(null);

  // 原生過濾/追蹤門檻（亮度/彩度/區塊/ROI）
  const [yMinNum, setYMinNum] = React.useState(150); // 100~220
  const [cMaxNum, setCMaxNum] = React.useState(20);  // 5~40
  const [blkNum, setBlkNum] = React.useState(8);     // 4~16
  const [roiNum, setRoiNum] = React.useState(64);    // 32~128（>= block）

  // 錄製
  const [recording, setRecording] = React.useState(false);
  const recordBufRef = React.useRef<
    Array<{ idx: number; x: number; y: number; ts: number }>
  >([]);

  // 追蹤軌跡（最近 1.5 秒）frame normalized
  const trailRef = React.useRef<Array<{ x: number; y: number; ts: number }>>(
    [],
  );

  // 偏好載入
  React.useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(PREF_KEY);
        if (!s) return;
        const p = JSON.parse(s);
        if (p.unit) setUnit(p.unit);
        if (typeof p.minKmh === 'number') setMinKmh(p.minKmh);
        if (typeof p.maxKmh === 'number') setMaxKmh(p.maxKmh);
        if (typeof p.alpha === 'number') setAlpha(p.alpha);
        if (typeof p.holdMs === 'number') setHoldMs(p.holdMs);
        if (typeof p.yMinNum === 'number') setYMinNum(p.yMinNum);
        if (typeof p.cMaxNum === 'number') setCMaxNum(p.cMaxNum);
        if (typeof p.blkNum === 'number') setBlkNum(p.blkNum);
        if (typeof p.roiNum === 'number') setRoiNum(p.roiNum);
      } catch {}
    })();
  }, []);

  // 偏好保存（簡易節流）
  React.useEffect(() => {
    const t = setTimeout(() => {
      const payload = {
        unit,
        minKmh,
        maxKmh,
        alpha,
        holdMs,
        yMinNum,
        cMaxNum,
        blkNum,
        roiNum,
      };
      AsyncStorage.setItem(PREF_KEY, JSON.stringify(payload)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [unit, minKmh, maxKmh, alpha, holdMs, yMinNum, cMaxNum, blkNum, roiNum]);

  // 點選（四點/兩點）使用映射：View → FrameNormalized
  const onTapOverlay = (evt: any) => {
    const mv = getMapVars(viewSize, frameSizeRef.current);
    if (!mv) {
      Alert.alert('等待相機幀尺寸…');
      return;
    }
    const { locationX, locationY } = evt.nativeEvent;
    const p = viewToFrameNorm(locationX, locationY, mv);

    if (calib4On) {
      const next = [...corners, p];
      if (next.length < 4) {
        setCorners(next);
      } else {
        const fs = frameSizeRef.current!;
        const srcPx = next.map((pt) => ({ x: pt.x * fs.w, y: pt.y * fs.h }));
        const L = 13.4;
        const W = courtMode === 'doubles' ? 6.1 : 5.18;
        try {
          const h = computeHomography(srcPx, [
            { X: 0, Y: 0 },
            { X: W, Y: 0 },
            { X: W, Y: L },
            { X: 0, Y: L },
          ]);
          setH(h);
          setCorners(next);
          setCalib4On(false);
          Alert.alert('完成', '四點校正已建立');
        } catch {
          Alert.alert('失敗', '無法建立透視變換，請重試（確認四點順序與不共線）');
          setCorners([]);
          setH(null);
        }
      }
      return;
    }

    if (calib2On) {
      if (!calibA) setCalibA(p);
      else if (!calibB) setCalibB(p);
      else {
        setCalibA(p);
        setCalibB(null);
      }
    }
  };

  const applyCalib2 = (knownMeters: number) => {
    if (!calibA || !calibB) {
      Alert.alert('請先點兩點');
      return;
    }
    const du = Math.hypot(calibB.x - calibA.x, calibB.y - calibA.y);
    if (du < 1e-4) {
      Alert.alert('兩點太近');
      return;
    }
    setMetersPerUnit(knownMeters / du);
    setCalib2On(false);
  };

  const clearAllCalib = () => {
    setMetersPerUnit(null);
    setCalibA(null);
    setCalibB(null);
    setH(null);
    setCorners([]);
    setCalib4On(false);
  };

  const startRecord = () => {
    recordBufRef.current = [];
    setRecording(true);
  };
  const stopRecordAndSave = async () => {
    setRecording(false);
    const rows = recordBufRef.current.slice();
    if (rows.length < 2) {
      Alert.alert('提示', '資料不足，未儲存');
      return;
    }
    try {
      const sid = await insertSpeedSession('camera', 'kmh');
      await insertSpeedPoints(
        sid,
        rows.map((r, i) => ({
          idx: i,
          rx: r.x,
          ry: r.y,
          ts: Math.round(r.ts),
        })),
      );
      Alert.alert('已儲存', `共 ${rows.length} 筆！`);
    } catch (e: any) {
      Alert.alert('儲存失敗', String(e?.message || e));
    }
  };

  const onSample = React.useCallback(
    (e: NativeSyntheticEvent<NativeSample>) => {
      const s = e.nativeEvent;
      if (s.w && s.h) frameSizeRef.current = { w: s.w, h: s.h };

      const last = lastRef.current;
      if (!last) {
        lastRef.current = s;
        return;
      }

      const dtSec = (s.ts - last.ts) / 1000;
      if (dtSec <= 0.005 || dtSec > 0.5) {
        lastRef.current = s;
        return;
      }

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
        const minMps = minKmh / 3.6;
        const maxMps = maxKmh / 3.6;
        if (mps >= minMps && mps <= maxMps) {
          updateSpeed(mps);

          const now = s.ts;
          const disp = msToUnit(mps);
          const curMax = maxHoldRef.current;
          const expired = now > curMax.until;
          if (expired || disp > msToUnit(curMax.v)) {
            maxHoldRef.current = { v: mps, until: now + holdMs };
          }

          const n = s.ts;
          trailRef.current.push({ x: s.x, y: s.y, ts: n });
          trailRef.current = trailRef.current.filter((p) => n - p.ts <= 1500);

          if (recording) {
            recordBufRef.current.push({
              idx: recordBufRef.current.length,
              x: s.x,
              y: s.y,
              ts: s.ts,
            });
          }
        }
      }
      lastRef.current = s;
    },
    [
      H,
      metersPerUnit,
      minKmh,
      maxKmh,
      recording,
      updateSpeed,
      msToUnit,
      holdMs,
    ],
  );

  const cur = msToUnit(speedMs);
  const avg = msToUnit(avgMs);
  const maxDisp = (() => {
    const now = Date.now();
    const curMax = maxHoldRef.current;
    if (now <= curMax.until && curMax.v > 0) return msToUnit(curMax.v);
    return null;
  })();

  const onOverlayLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewSize({ w: width, h: height });
  };

  if (!hasPerm)
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text>尚未取得相機權限</Text>
      </View>
    );

  // 面板尺寸（旋轉前）
  const PANEL_W = 560;
  const PANEL_MAX_H = 360;

  // 取 MapVars（供繪製點時用反變換）
  const mv = getMapVars(viewSize, frameSizeRef.current);

  // 把一串 frame normalized 座標轉回 View px
  const mapTrailToScreen = React.useCallback(() => {
    if (!mv) return '';
    return trailRef.current
      .map((p) => {
        const v = frameNormToView(p.x, p.y, mv);
        return `${v.x},${v.y}`;
      })
      .join(' ');
  }, [mv]);

  // 工具：把單一幀座標畫在螢幕
  const drawDot = (pt?: Pt | null, color = '#fff', r = 6) => {
    if (!mv || !pt) return null;
    const v = frameNormToView(pt.x, pt.y, mv);
    return <Circle cx={v.x} cy={v.y} r={r} fill={color} />;
  };

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

      {/* 軌跡繪製（最近 1.5 秒）＋ 校正點可視化（改用 frameNormToView） */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      >
        <Svg width={viewSize.w} height={viewSize.h}>
          <Polyline
            points={mv ? mapTrailToScreen() : ''}
            stroke="#00e5ff"
            strokeWidth={3}
            fill="none"
            opacity={0.85}
          />
          {/* 末端點 */}
          {mv && trailRef.current.length > 0 && (
            (() => {
              const p = trailRef.current[trailRef.current.length - 1];
              const v = frameNormToView(p.x, p.y, mv);
              return <Circle cx={v.x} cy={v.y} r={6} fill="#00e5ff" />;
            })()
          )}
          {/* 四點校正點＆輪廓 */}
          {corners.map((pt, i) => drawDot(pt, '#ffeb3b', 6))}
          {mv && corners.length === 4 && (
            <Polyline
              points={
                corners
                  .concat([corners[0]])
                  .map((pt) => {
                    const v = frameNormToView(pt.x, pt.y, mv);
                    return `${v.x},${v.y}`;
                  })
                  .join(' ')
              }
              stroke="#ffeb3b"
              strokeWidth={2}
              fill="none"
              opacity={0.7}
            />
          )}
          {/* 兩點校正點 */}
          {drawDot(calibA, '#ffc107', 6)}
          {drawDot(calibB, '#ff9800', 6)}
        </Svg>
      </View>

      {/* 速度顯示（橫向） */}
      <View style={{ position: 'absolute', right: 0, top: 75 }}>
        <RotBox>
          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 8,
              paddingVertical: 6,
              paddingHorizontal: 10,
            }}
          >
            {H || metersPerUnit ? (
              <>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                  {cur.toFixed(1)} {unit}（α={alpha.toFixed(2)}）
                </Text>
                <Text style={{ color: '#fff', marginTop: 2 }}>
                  平均 {avg.toFixed(1)} {unit}
                  {maxDisp != null ? ` · MAX ${maxDisp.toFixed(1)} ${unit}` : ''}
                </Text>
              </>
            ) : (
              <Text style={{ color: '#fff' }}>尚未校正</Text>
            )}
          </View>
        </RotBox>
      </View>

      {/* 設定面板開關（橫向） */}
      <View style={{ position: 'absolute', right: 10, top: 200 }}>
        <RotBox>
          <Pressable
            onPress={() => setPanelOpen((o) => !o)}
            style={{
              backgroundColor: panelOpen ? '#455a64' : '#1976d2',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#fff' }}>
              {panelOpen ? '收合設定' : '展開設定'}
            </Text>
          </Pressable>
        </RotBox>
      </View>

      {/* 設定面板（橫向）：兩欄 + 內層滾動 */}
      {panelOpen && (
        <View style={{ position: 'absolute', right: 320, bottom: 50 }}>
          <RotBox>
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: 12,
                padding: 12,
                width: 560,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: '700',
                  marginBottom: 8,
                }}
              >
                設定
              </Text>

              <View style={{ maxHeight: 360 }}>
                <ScrollView
                  showsVerticalScrollIndicator
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {/* 左欄 */}
                    <View style={{ width: 270, paddingRight: 8 }}>
                      {/* 速度門檻（km/h） */}
                      <RangeBar
                        label="速度下限"
                        value={minKmh}
                        min={50}
                        max={300}
                        step={5}
                        unit="km/h"
                        defaultValue={200}
                        onChange={(v) => {
                          const nv = Math.min(v, maxKmh);
                          setMinKmh(nv);
                          if (nv >= maxKmh) setMaxKmh(Math.min(600, nv + 50));
                        }}
                      />
                      <RangeBar
                        label="速度上限"
                        value={maxKmh}
                        min={200}
                        max={600}
                        step={5}
                        unit="km/h"
                        defaultValue={500}
                        onChange={(v) => setMaxKmh(Math.max(v, minKmh))}
                      />

                      {/* 單位 */}
                      <View style={{ marginTop: 6, marginBottom: 10 }}>
                        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>
                          單位
                        </Text>
                        <View style={{ flexDirection: 'row' }}>
                          <Pressable
                            onPress={() => setUnit('kmh')}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: unit === 'kmh' ? '#90caf9' : '#555',
                              backgroundColor:
                                unit === 'kmh' ? 'rgba(144,202,249,0.15)' : '#1f1f1f',
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>km/h</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setUnit('mph')}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: unit === 'mph' ? '#90caf9' : '#555',
                              backgroundColor:
                                unit === 'mph' ? 'rgba(144,202,249,0.15)' : '#1f1f1f',
                            }}
                          >
                            <Text style={{ color: '#fff' }}>mph</Text>
                          </Pressable>
                        </View>
                      </View>

                      <RangeBar
                        label="平滑係數 α"
                        value={alpha}
                        min={0.05}
                        max={0.6}
                        step={0.01}
                        hint="0.05=更平滑，0.5=更靈敏"
                        defaultValue={0.3}
                        onChange={(v) => setAlpha(v)}
                      />
                      <RangeBar
                        label="MAX 暫留"
                        value={holdMs}
                        min={0}
                        max={2000}
                        step={50}
                        unit="ms"
                        defaultValue={800}
                        onChange={(v) => setHoldMs(v)}
                      />
                    </View>

                    {/* 右欄 */}
                    <View style={{ width: 270, paddingLeft: 8 }}>
                      <Text
                        style={{
                          color: '#fff',
                          fontWeight: '700',
                          marginBottom: 6,
                        }}
                      >
                        白球過濾/追蹤
                      </Text>
                      <RangeBar
                        label="亮度 yMin"
                        value={yMinNum}
                        min={100}
                        max={220}
                        step={2}
                        defaultValue={150}
                        onChange={(v) => setYMinNum(v)}
                      />
                      <RangeBar
                        label="彩度偏移 cMax"
                        value={cMaxNum}
                        min={5}
                        max={40}
                        step={1}
                        defaultValue={20}
                        onChange={(v) => setCMaxNum(v)}
                      />
                      <RangeBar
                        label="區塊大小 block"
                        value={blkNum}
                        min={4}
                        max={16}
                        step={1}
                        defaultValue={8}
                        onChange={(v) => {
                          const b = Math.round(v);
                          setBlkNum(b);
                          if (roiNum < b) setRoiNum(b);
                        }}
                      />
                      <RangeBar
                        label="ROI 半徑"
                        value={roiNum}
                        min={32}
                        max={128}
                        step={4}
                        defaultValue={64}
                        onChange={(v) => setRoiNum(Math.max(Math.round(v), blkNum))}
                      />

                      {/* 四點校正（優先） */}
                      <View style={{ marginTop: 6, marginBottom: 10 }}>
                        <Text
                          style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}
                        >
                          四點校正
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          <Pressable
                            onPress={() => {
                              setCalib4On(true);
                              setCorners([]);
                              setH(null);
                              setCalib2On(false);
                            }}
                            style={{
                              backgroundColor: '#1976d2',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>
                              {calib4On ? '點四角：進行中…' : '開始點四角'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              setCourtMode((m) => (m === 'doubles' ? 'singles' : 'doubles'))
                            }
                            style={{
                              backgroundColor: '#455a64',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>
                              {courtMode === 'doubles'
                                ? '模式：雙打 6.1×13.4'
                                : '模式：單打 5.18×13.4'}
                            </Text>
                          </Pressable>
                        </View>
                        {!!corners.length && (
                          <Text style={{ color: '#ddd', marginBottom: 6 }}>
                            已點 {corners.length}/4（順序：上左→上右→下右→下左）
                          </Text>
                        )}
                        {!!H && (
                          <Text style={{ color: '#90caf9' }}>
                            已使用四點校正（更精準）
                          </Text>
                        )}
                      </View>

                      {/* 二點校正（快速/備用） */}
                      <View style={{ marginBottom: 6 }}>
                        <Text
                          style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}
                        >
                          二點寬度校正
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          <Pressable
                            onPress={() => {
                              setCalib2On(true);
                              setCalibA(null);
                              setCalibB(null);
                              setMetersPerUnit(null);
                              setCalib4On(false);
                            }}
                            style={{
                              backgroundColor: '#1976d2',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>
                              {calib2On ? '點兩點：進行中…' : '開始點兩點'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => applyCalib2(6.1)}
                            style={{
                              backgroundColor: '#2e7d32',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              marginRight: 8,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>雙打寬 6.1m</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => applyCalib2(5.18)}
                            style={{
                              backgroundColor: '#00796b',
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>單打寬 5.18m</Text>
                          </Pressable>
                        </View>
                        {!!metersPerUnit && (
                          <Text style={{ color: '#90caf9' }}>
                            二點比例：{metersPerUnit.toFixed(3)} m / unit
                          </Text>
                        )}
                      </View>
                      {/* 錄製控制／清除校正 */}
                      <View style={{ flexDirection: 'row', marginTop: 6 }}>
                        {!recording ? (
                          <Pressable
                            onPress={startRecord}
                            style={{
                              backgroundColor: '#e53935',
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>開始錄製</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={stopRecordAndSave}
                            style={{
                              backgroundColor: '#8e24aa',
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ color: '#fff' }}>停止並儲存</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={clearAllCalib}
                          style={{
                            backgroundColor: '#9e9e9e',
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: '#fff' }}>清除校正</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </RotBox>
        </View>
      )}
    </View>
  );
}

// ----------- RangeBar（拉桿） -----------
function clamp(n: number, a: number, b: number) {
  return Math.min(Math.max(n, a), b);
}
function roundStep(v: number, step: number) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}
function formatNumber(v: number, decimals = 0) {
  const f = Math.pow(10, decimals);
  return String(Math.round(v * f) / f);
}
function RangeBar({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  hint,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  defaultValue?: number;
  onChange: (v: number) => void;
}) {
  const trackRef = React.useRef<View>(null);
  const [trackW, setTrackW] = React.useState(0);

  const pct = max > min ? (value - min) / (max - min) : 0;
  const fillW = Math.round(trackW * pct);

  const onLayoutTrack = (e: any) => {
    setTrackW(Math.floor(e.nativeEvent.layout.width || 0));
  };

  const setFromX = (x: number) => {
    const p = clamp(x / Math.max(1, trackW), 0, 1);
    const raw = min + p * (max - min);
    const stepped = roundStep(raw, step);
    onChange(clamp(stepped, min, max));
  };

  const onStart = (e: any) => {
    const x = e.nativeEvent.locationX;
    setFromX(x);
    return true;
  };
  const onMove = (e: any) => {
    const x = e.nativeEvent.locationX;
    setFromX(x);
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
            {formatNumber(value, step < 1 ? 2 : 0)}
          </Text>
          {!!unit && <Text style={{ color: '#bbb', marginLeft: 2 }}>{unit}</Text>}
        </View>
      </View>
      {!!hint && <Text style={{ color: '#9e9e9e', marginBottom: 4 }}>{hint}</Text>}

      <View
        ref={trackRef}
        onLayout={onLayoutTrack}
        style={{
          height: 28,
          borderRadius: 8,
          backgroundColor: '#1f1f1f',
          borderWidth: 1,
          borderColor: '#555',
          overflow: 'hidden',
        }}
      >
        <View style={{ width: fillW, height: '100%', backgroundColor: '#1976d2' }} />
        <View
          style={{ position: 'absolute', inset: 0 }}
          onStartShouldSetResponder={() => true}
          onResponderGrant={onStart}
          onResponderMove={onMove}
        />
      </View>

      <View
        style={{
          marginTop: 6,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#888' }}>
          {formatNumber(min, step < 1 ? 2 : 0)}{unit} ~ {formatNumber(max, step < 1 ? 2 : 0)}{unit}
        </Text>
        {typeof defaultValue === 'number' && (
          <Pressable
            onPress={() => onChange(clamp(defaultValue, min, max))}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#90caf9',
              backgroundColor: 'rgba(144,202,249,0.15)',
            }}
          >
            <Text style={{ color: '#fff' }}>預設</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}