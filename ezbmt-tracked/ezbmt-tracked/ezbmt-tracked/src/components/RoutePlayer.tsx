import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';

type RouteItem = {
  sx: number; sy: number;
  ex: number; ey: number;
  kind: 'win' | 'loss';
  meta?: { shotType?: string; forceType?: string; errorReason?: string };
};

type Props = {
  width: number;
  height: number;
  routes: RouteItem[];
  autoPlay?: boolean;
  initialSpeed?: 0.5 | 1 | 2;
  filter?: 'all' | 'win' | 'loss' | 'random';
  onIndexChange?: (index: number) => void;
};

const FULL_LEN = 13.4;
const FULL_WID = 6.1;
const SHORT_LINE_DIST = 1.98;
const DBL_LONG_BACK = 0.76;

export default function RoutePlayer({
  width, height, routes, autoPlay = true, initialSpeed = 1, filter = 'all', onIndexChange,
}: Props) {
  const [index, setIndex] = React.useState(0);
  const [t, setT] = React.useState(0); // 0..1
  const [playing, setPlaying] = React.useState(autoPlay);
  const [speed, setSpeed] = React.useState<0.5 | 1 | 2>(initialSpeed);

  const rafRef = React.useRef<number | null>(null);
  const lastTsRef = React.useRef<number | null>(null);

  const filtered = React.useMemo(() => {
    if (filter === 'all') return routes;
    if (filter === 'win') return routes.filter(r => r.kind === 'win');
    if (filter === 'loss') return routes.filter(r => r.kind === 'loss');
    if (filter === 'random') {
      const arr = routes.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    }
    return routes;
  }, [routes, filter]);

  const total = filtered.length;
  const idx = Math.max(0, Math.min(index, Math.max(0, total - 1)));
  const cur = total ? filtered[idx] : null;

  React.useEffect(() => { setIndex(0); setT(0); setPlaying(autoPlay); }, [filter, routes, autoPlay]);

  React.useEffect(() => { onIndexChange?.(idx); }, [idx, onIndexChange]);

  React.useEffect(() => {
    if (!playing || !cur) return;
    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last ? (ts - last) : 16;
      const dur = 1500 / speed;
      setT((prev) => {
        const nt = prev + dt / dur;
        if (nt >= 1) {
          next();
          return 0;
        }
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
  }, [playing, idx, speed, cur]);

  function toggle() { setPlaying(p => !p); }
  function replay() { setT(0); if (total) setPlaying(true); }
  function prev() {
    if (idx > 0) { setIndex(i => i - 1); setT(0); setPlaying(true); }
    else { setT(0); setPlaying(false); }
  }
  function next() {
    if (idx < total - 1) { setIndex(i => i + 1); setT(0); setPlaying(true); }
    else { setPlaying(false); setT(1); }
  }

  const dotR = Math.max(4, Math.round(Math.min(width, height) * 0.01));
  const trackW = Math.max(3, Math.round(Math.min(width, height) * 0.008));

  const sx = cur ? cur.sx * width : 0;
  const sy = cur ? cur.sy * height : 0;
  const ex = cur ? cur.ex * width : 0;
  const ey = cur ? cur.ey * height : 0;
  const cx = sx + (ex - sx) * t;
  const cy = sy + (ey - sy) * t;
  const color = cur?.kind === 'win' ? '#1976d2' : '#d32f2f';

  function CourtLines() {
    // 實際以整張直式球場填滿畫布（你的 routes 已是 portrait 相對座標）
    const innerW = width, innerH = height;
    const midY = innerH / 2;
    const midX = innerW / 2;
    const syScale = innerH / FULL_LEN;
    const sxScale = innerW / FULL_WID;
    const topBack = 0;
    const bottomBack = innerH;
    const topShort = midY - SHORT_LINE_DIST * syScale;
    const bottomShort = midY + SHORT_LINE_DIST * syScale;
    const topDblLong = topBack + DBL_LONG_BACK * syScale;
    const bottomDblLong = bottomBack - DBL_LONG_BACK * syScale;
    const singleLeft = (innerW - (5.18 * sxScale)) / 2;
    const singleRight = innerW - singleLeft;

    const line = '#f0e6da';
    const lineW = Math.max(2, Math.round(Math.min(innerW, innerH) * 0.012));

    return (
      <>
        <Rect x={0} y={0} width={innerW} height={innerH} fill="#2e7d32" />
        <Line x1={0} y1={0} x2={innerW} y2={0} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={0} x2={0} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={innerW} y1={0} x2={innerW} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={singleLeft} y1={0} x2={singleLeft} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={singleRight} y1={0} x2={singleRight} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={midY} x2={innerW} y2={midY} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={topShort} x2={innerW} y2={topShort} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={bottomShort} x2={innerW} y2={bottomShort} stroke={line} strokeWidth={lineW} />
        <Line x1={midX} y1={topShort} x2={midX} y2={0} stroke={line} strokeWidth={lineW} />
        <Line x1={midX} y1={bottomShort} x2={midX} y2={innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={topDblLong} x2={innerW} y2={topDblLong} stroke={line} strokeWidth={lineW} />
        <Line x1={0} y1={bottomDblLong} x2={innerW} y2={bottomDblLong} stroke={line} strokeWidth={lineW} />
      </>
    );
  }

  const badge = (txt: string) => (
    <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)', marginRight: 6 }}>
      <Text style={{ color: '#fff' }}>{txt}</Text>
    </View>
  );

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

      {/* 當前球的標籤（球種/主受迫/原因） */}
      {cur?.meta && (
        <View style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row' }}>
          {!!cur.meta.shotType && badge(cur.meta.shotType)}
          {!!cur.meta.forceType && badge(cur.meta.forceType)}
          {!!cur.meta.errorReason && badge(cur.meta.errorReason)}
        </View>
      )}

      {/* 控制列 */}
      <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff' }}>{total ? `第 ${idx + 1}/${total} 球` : '無可播放路徑'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={prev} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#424242', borderRadius: 6, marginRight: 6 }}>
              <Text style={{ color: '#fff' }}>上一球</Text>
            </Pressable>
            <Pressable onPress={toggle} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 6, marginRight: 6 }}>
              <Text style={{ color: '#fff' }}>{playing ? '暫停' : '播放'}</Text>
            </Pressable>
            <Pressable onPress={replay} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#455a64', borderRadius: 6, marginRight: 6 }}>
              <Text style={{ color: '#fff' }}>重播</Text>
            </Pressable>
            <Pressable onPress={next} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#424242', borderRadius: 6 }}>
              <Text style={{ color: '#fff' }}>下一球</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {(['all','win','loss','random'] as Array<'all'|'win'|'loss'|'random'>).map((f) => (
            <View key={f} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: filter === f ? '#90caf9' : '#bbb', backgroundColor: filter === f ? 'rgba(144,202,249,0.15)' : 'rgba(255,255,255,0.05)', marginRight: 6 }}>
              <Text style={{ color: '#fff' }}>{f === 'all' ? '全部' : f === 'win' ? '只播得分' : f === 'loss' ? '只播失分' : '隨機'}</Text>
            </View>
          ))}
          {([0.5, 1, 2] as (0.5 | 1 | 2)[]).map((s) => (
            <Pressable
              key={String(s)}
              onPress={() => setSpeed(s)}
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: speed === s ? '#90caf9' : '#bbb', backgroundColor: speed === s ? 'rgba(144,202,249,0.15)' : 'rgba(255,255,255,0.05)', marginRight: 6 }}
            >
              <Text style={{ color: '#fff' }}>{s}x</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}