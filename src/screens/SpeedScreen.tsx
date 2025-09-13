import React from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import Court from '../components/Court';
import type { Orientation, Point } from '../types';
import { insertSpeedSession, insertSpeedPoints } from '../db';

const FULL_WID = 6.1;  // 直式雙打外框寬（公尺）
const FULL_LEN = 13.4; // 直式雙打外框長（公尺）

export default function SpeedScreen() {
const [orientation] = React.useState<Orientation>('portrait'); // 以直式為主；Court 內部會把 landscape 轉回直式基準運算
const [singles, setSingles] = React.useState(false);          // 只影響繪圖，不影響距離（距離換算固定以雙打外框）
const [routeStart, setRouteStart] = React.useState<Point | null>(null);
const [routeHover, setRouteHover] = React.useState<Point | null>(null);

const [startNorm, setStartNorm] = React.useState<{ x: number; y: number } | null>(null);
const [endNorm, setEndNorm] = React.useState<{ x: number; y: number } | null>(null);

const [autoStart, setAutoStart] = React.useState(true);
const [running, setRunning] = React.useState(false);
const [startTs, setStartTs] = React.useState<number | null>(null);
const [stopTs, setStopTs] = React.useState<number | null>(null);

const clearAll = () => {
setRouteStart(null);
setRouteHover(null);
setStartNorm(null);
setEndNorm(null);
setStartTs(null);
setStopTs(null);
setRunning(false);
};

const onTap = (e: any) => {
// e: TapEvent（來自 Court）
if (!routeStart) {
setRouteStart(e.point);
setRouteHover(null);
setStartNorm(e.norm ?? null);
setEndNorm(null);
setStopTs(null);
if (autoStart) {
setStartTs(Date.now());
setRunning(true);
}
} else {
setRouteHover(e.point);
setEndNorm(e.norm ?? null);
if (running) {
setStopTs(Date.now());
setRunning(false);
} else if (autoStart && startTs == null) {
// 理論上不會進來；保底：若使用者關閉/打開開關後第一次點才起
setStartTs(Date.now());
setRunning(true);
}
}
};

const onHover = (p: Point | null) => {
if (routeStart && !endNorm) setRouteHover(p || null);
};

// 手動控制計時
const manualStart = () => {
setStartTs(Date.now());
setStopTs(null);
setRunning(true);
};
const manualStop = () => {
if (!running) return;
setStopTs(Date.now());
setRunning(false);
};

// 兩點距離（公尺）：norm 是以直式雙打外框（6.1×13.4）為基準
const distanceM = React.useMemo(() => {
if (!startNorm || !endNorm) return 0;
const dx = (endNorm.x - startNorm.x) * FULL_WID;
const dy = (endNorm.y - startNorm.y) * FULL_LEN;
return Math.sqrt(dx * dx + dy * dy);
}, [startNorm, endNorm]);

// 經過時間（秒）
const elapsedSec = React.useMemo(() => {
if (startTs == null) return 0;
const end = (stopTs ?? (running ? Date.now() : null));
if (!end) return 0;
return Math.max(0, (end - startTs) / 1000);
}, [startTs, stopTs, running]);

const ms = distanceM > 0 && elapsedSec > 0 ? distanceM / elapsedSec : 0;
const kmh = ms * 3.6;

return (
<View style={{ flex: 1 }}>
{/* 頂列：工具 */}
<View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' }}>
<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginRight: 12 }}>羽球測速</Text>
<Pressable onPress={clearAll} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#757575', borderRadius: 8 }}>
<Text style={{ color: '#fff' }}>重置</Text>
</Pressable>
</View>

    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ marginRight: 8 }}>單打視覺：</Text>
      <Switch value={singles} onValueChange={setSingles} />
      <Text style={{ marginLeft: 16, marginRight: 8 }}>自動計時（第1點→開始，第2點→停止）：</Text>
      <Switch value={autoStart} onValueChange={setAutoStart} />
      {!autoStart && (
        <View style={{ flexDirection: 'row', marginLeft: 12 }}>
          <Pressable
            onPress={manualStart}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1976d2', borderRadius: 8, marginRight: 8 }}
          >
            <Text style={{ color: '#fff' }}>開始</Text>
          </Pressable>
          <Pressable
            onPress={manualStop}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#d32f2f', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff' }}>停止</Text>
          </Pressable>
        </View>
      )}
    </View>
  </View>

  {/* 球場與互動 */}
  <View style={{ flex: 1 }}>
    <Court
      orientation={orientation}
      singles={singles}
      mode="route"
      routeStart={routeStart}
      routeHover={routeHover}
      onTap={onTap}
      onHover={onHover}
      markers={[]}
      onPressMarker={undefined}
    />
  </View>

  {/* 結果區 */}
  <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#eee' }}>
    <Text style={{ fontWeight: '600', marginBottom: 6 }}>結果</Text>
    <Text>距離：{distanceM.toFixed(3)} m（以雙打外框 6.1×13.4 m 換算）</Text>
    <Text>時間：{elapsedSec.toFixed(3)} s {running ? '（計時中…）' : ''}</Text>
    <Text style={{ marginTop: 4, fontSize: 16 }}>
      速度：{ms.toFixed(2)} m/s（{kmh.toFixed(1)} km/h）
    </Text>
    <Text style={{ color: '#666', marginTop: 6 }}>
      使用方式：在球場上點下「擊球點」與「落點」。若開啟自動計時，第一次點擊即開始、第二次點擊即停止；關閉自動計時時，請用下方按鈕手動開始/停止。
    </Text>
  </View>
</View>
);
}