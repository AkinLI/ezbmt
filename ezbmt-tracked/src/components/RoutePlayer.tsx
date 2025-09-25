import React, {
useEffect,
useImperativeHandle,
useMemo,
useRef,
useState,
forwardRef,
} from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';

export type RouteItem = {
sx: number; sy: number;     // normalized start (可為 <0 或 >1：出界)
ex: number; ey: number;     // normalized end   (可為 <0 或 >1：出界)
kind: 'win' | 'loss';
color?: string;             // 可由外部指定線色（主=藍、客=紅）
meta?: { shotType?: string; forceType?: string; errorReason?: string };
};

export type RoutePlayerHandle = {
play: () => void;
pause: () => void;
toggle: () => void;
prev: () => void;
next: () => void;
replay: () => void;
restartAll: () => void;           // 全部重播（從第一球）
setSpeed: (s: 0.5 | 1 | 2) => void;
};

type Props = {
width: number;
height: number;
routes: RouteItem[];
autoPlay?: boolean;
initialSpeed?: 0.5 | 1 | 2;
filter?: 'all' | 'win' | 'loss' | 'random';
onIndexChange?: (index: number) => void;
onPlayingChange?: (playing: boolean) => void;
controls?: 'full' | 'none';       // 預設 'none'：不畫內建控制列
showFilterChips?: boolean;        // controls='full' 時才有意義
};

// 球場實際規格（直式）
const FULL_LEN = 13.4;
const FULL_WID = 6.1;
const SHORT_LINE_DIST = 1.98;
const DBL_LONG_BACK = 0.76;

// 為「界外」預留的可視邊界（比例以整張畫布計算）
// 例如 0.15 代表左右/上下各留 15% 空間，用來容納 rx/ry < 0 或 > 1 的落點
const OUT_PAD_X = 0.1;
const OUT_PAD_Y = 0.02;

const RoutePlayer = forwardRef<RoutePlayerHandle, Props>(function RoutePlayer(
{
width,
height,
routes,
autoPlay = true,
initialSpeed = 1,
filter = 'all',
onIndexChange,
onPlayingChange,
controls = 'none',
showFilterChips = false,
},
ref
) {
const [index, setIndex] = useState(0);
const [t, setT] = useState(0);
const [playing, setPlaying] = useState(autoPlay);
const [speed, setSpeed] = useState<0.5 | 1 | 2>(initialSpeed);

const rafRef = useRef<number | null>(null);
const lastTsRef = useRef<number | null>(null);

// 預先計算「球場本體」繪製區（inner）與映射函式（mapX/mapY）
const padX = Math.round(width * OUT_PAD_X);
const padY = Math.round(height * OUT_PAD_Y);
const innerW = Math.max(1, width - padX * 2);
const innerH = Math.max(1, height - padY * 2);

const mapX = (rx: number) => padX + rx * innerW;
const mapY = (ry: number) => padY + ry * innerH;

const filtered = useMemo(() => {
if (filter === 'all') return routes;
if (filter === 'win') return routes.filter(r => r.kind === 'win');
if (filter === 'loss') return routes.filter(r => r.kind === 'loss');
if (filter === 'random') {
const arr = routes.slice();
for (let i = arr.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[arr[i], arr[j]] = [arr[j], arr[i]];
}
return arr;
}
return routes;
}, [routes, filter]);

useEffect(() => { setIndex(0); setT(0); setPlaying(autoPlay); }, [filter, routes, autoPlay]);
useEffect(() => { onIndexChange?.(index); }, [index, onIndexChange]);
useEffect(() => { onPlayingChange?.(playing); }, [playing, onPlayingChange]);

useEffect(() => {
if (!playing || !filtered.length) return;
const step = (ts: number) => {
const last = lastTsRef.current;
lastTsRef.current = ts;
const dt = last ? (ts - last) : 16;
const dur = 1500 / speed;
setT(prev => {
const nt = prev + dt / dur;
if (nt >= 1) { next(); return 0; }
return nt;
});
rafRef.current = requestAnimationFrame(step);
};
rafRef.current = requestAnimationFrame(step);
return () => {
if (rafRef.current) cancelAnimationFrame(rafRef.current);
rafRef.current = null;
lastTsRef.current = null;
};
}, [playing, index, speed, filtered.length]);

const total = filtered.length;
const idx = Math.max(0, Math.min(index, Math.max(0, total - 1)));
const cur = total ? filtered[idx] : null;

function play() { if (total) setPlaying(true); }
function pause() { setPlaying(false); }
function toggle() { setPlaying(p => !p); }
function prev() {
if (!total) return;
if (idx > 0) { setIndex(i => i - 1); setT(0); setPlaying(true); }
else { setT(0); setPlaying(false); }
}
function next() {
if (!total) return;
if (idx < total - 1) { setIndex(i => i + 1); setT(0); setPlaying(true); }
else { setPlaying(false); setT(1); }
}
function replay() { setT(0); if (total) setPlaying(true); }
function restartAll() { setIndex(0); setT(0); setPlaying(true); }

useImperativeHandle(
ref,
() => ({ play, pause, toggle, prev, next, replay, restartAll, setSpeed }),
[total]
);

// 點大小與線寬依 inner 區域尺度計算（避免含 padding 時視覺過小）
const sizeBase = Math.min(innerW, innerH);
const dotR = Math.max(4, Math.round(sizeBase * 0.01));
const trackW = Math.max(3, Math.round(sizeBase * 0.008));

// 位置映射（把 normalized *inner + padding）
const sx = cur ? mapX(cur.sx) : 0;
const sy = cur ? mapY(cur.sy) : 0;
const ex = cur ? mapX(cur.ex) : 0;
const ey = cur ? mapY(cur.ey) : 0;
const cx = sx + (ex - sx) * t;
const cy = sy + (ey - sy) * t;

// 路徑顏色（優先用外部 color；否則依得/失）
const color = cur?.color || (cur?.kind === 'win' ? '#1976d2' : '#d32f2f');

// 以 inner 繪製球場（綠底與線）
function CourtLines() {
const midY = padY + innerH / 2;
const midX = padX + innerW / 2;
const syScale = innerH / FULL_LEN;
const sxScale = innerW / FULL_WID;
const topShort = midY - SHORT_LINE_DIST * syScale;
const bottomShort = midY + SHORT_LINE_DIST * syScale;
const topDblLong = padY + 0 + DBL_LONG_BACK * syScale;
const bottomDblLong = padY + innerH - DBL_LONG_BACK * syScale;
const singleInnerW = 5.18 * sxScale;
const singleLeft = padX + (innerW - singleInnerW) / 2;
const singleRight = padX + innerW - (innerW - singleInnerW) / 2;
const line = '#f0e6da';
const lineW = Math.max(2, Math.round(Math.min(innerW, innerH) * 0.012));

return (
  <>
    {/* 背景透明層 */}
    <Rect x={0} y={0} width={width} height={height} fill="transparent" />
    {/* 球場本體（綠底） */}
    <Rect x={padX} y={padY} width={innerW} height={innerH} fill="#2e7d32" />
    {/* 外框 */}
    <Line x1={padX} y1={padY} x2={padX + innerW} y2={padY} stroke={line} strokeWidth={lineW} />
    <Line x1={padX} y1={padY + innerH} x2={padX + innerW} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    <Line x1={padX} y1={padY} x2={padX} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    <Line x1={padX + innerW} y1={padY} x2={padX + innerW} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    {/* 單打邊線 */}
    <Line x1={singleLeft} y1={padY} x2={singleLeft} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    <Line x1={singleRight} y1={padY} x2={singleRight} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    {/* 網 */}
    <Line x1={padX} y1={midY} x2={padX + innerW} y2={midY} stroke={line} strokeWidth={lineW} />
    {/* 短發球線 */}
    <Line x1={padX} y1={topShort} x2={padX + innerW} y2={topShort} stroke={line} strokeWidth={lineW} />
    <Line x1={padX} y1={bottomShort} x2={padX + innerW} y2={bottomShort} stroke={line} strokeWidth={lineW} />
    {/* 中央分界線 */}
    <Line x1={midX} y1={topShort} x2={midX} y2={padY} stroke={line} strokeWidth={lineW} />
    <Line x1={midX} y1={bottomShort} x2={midX} y2={padY + innerH} stroke={line} strokeWidth={lineW} />
    {/* 雙打長發球線 */}
    <Line x1={padX} y1={topDblLong} x2={padX + innerW} y2={topDblLong} stroke={line} strokeWidth={lineW} />
    <Line x1={padX} y1={bottomDblLong} x2={padX + innerW} y2={bottomDblLong} stroke={line} strokeWidth={lineW} />
  </>
);
}

return (
<View style={{ width, height }}>
<Svg width={width} height={height}>
<CourtLines />
{cur && (
<>
<Line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={trackW} strokeDasharray="12,8" opacity={0.5} />
<Circle cx={sx} cy={sy} r={dotR} fill={color} opacity={0.85} />
<Circle cx={ex} cy={ey} r={dotR} fill={color} opacity={0.85} />
<Circle cx={cx} cy={cy} r={dotR + 2} fill={color} />
</>
)}
</Svg>

  {/* 內建控制列關閉，外層自繪（controls='none'） */}
  {controls === 'full' && (
    <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff' }}>{total ? `第 ${idx + 1}/${total} 球` : '無可播放路徑'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={prev} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#424242', borderRadius: 6, marginRight: 6 }}>
            <Text style={{ color: '#fff' }}>上球</Text>
          </Pressable>
          <Pressable onPress={toggle} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 6, marginRight: 6 }}>
            <Text style={{ color: '#fff' }}>{playing ? '暫停' : '播放'}</Text>
          </Pressable>
          <Pressable onPress={replay} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#455a64', borderRadius: 6, marginRight: 6 }}>
            <Text style={{ color: '#fff' }}>重播</Text>
          </Pressable>
          <Pressable onPress={next} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#424242', borderRadius: 6 }}>
            <Text style={{ color: '#fff' }}>下球</Text>
          </Pressable>
        </View>
      </View>

      {showFilterChips && (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {/* 如需在內建控制列顯示篩選 chips，可在此補上。 */}
        </View>
      )}
    </View>
  )}
</View>
);
});

export default RoutePlayer;