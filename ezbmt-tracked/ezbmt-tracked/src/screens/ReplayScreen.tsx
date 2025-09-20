import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getRalliesByIds, listRalliesOrdered } from '../db';
import RoutePlayer, { RoutePlayerHandle } from '../components/RoutePlayer';

type RouteParam = { matchId: string; ids?: string[] };

type R = {
id: string;
route_start_rx?: number|null;
route_start_ry?: number|null;
route_end_rx?: number|null;
route_end_ry?: number|null;
winner_side: 'home'|'away';
meta_json?: string|null;
game_index?: number;
rally_no?: number;
};

const BLUE = '#1976d2';
const RED  = '#d32f2f';

function safeMeta(json: string|null|undefined) {
try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
function hasFullRoute(r: R) {
return (
r.route_start_rx != null && r.route_start_ry != null &&
r.route_end_rx   != null && r.route_end_ry   != null
);
}

export default function ReplayScreen() {
const route = useRoute<any>();
const { matchId, ids } = (route.params || {}) as RouteParam;

const [routes, setRoutes] = React.useState<Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss'; color:string; meta?: any }>>([]);
const [filter, setFilter] = React.useState<'all'|'win'|'loss'|'random'>('all');
const [nowIndex, setNowIndex] = React.useState(0);
const [playing, setPlaying] = React.useState(false);
const [speedHalf, setSpeedHalf] = React.useState(false); // 0.5x 切換

// non-null ref（避免型別錯）
const playerRef = React.useRef<RoutePlayerHandle>(null!);

React.useEffect(() => {
(async () => {
try {
let rows: R[] = [];

    if (Array.isArray(ids) && ids.length) {
      try { rows = await getRalliesByIds(ids); } catch { rows = []; }
    }
    if ((!rows || rows.length === 0) && matchId) {
      const all = await listRalliesOrdered(matchId) as unknown as R[];
      rows = (all || []).filter(hasFullRoute);
      rows.sort((a,b) => {
        const ga = Number(a.game_index||0), gb = Number(b.game_index||0);
        if (ga !== gb) return ga - gb;
        return Number(a.rally_no||0) - Number(b.rally_no||0);
      });
    }

    const items = (rows || [])
      .map((r) => {
        if (!hasFullRoute(r)) return null;
        const sx = Number(r.route_start_rx);
        const sy = Number(r.route_start_ry);
        const ex = Number(r.route_end_rx);
        const ey = Number(r.route_end_ry);
        if (!isFinite(sx) || !isFinite(sy) || !isFinite(ex) || !isFinite(ey)) return null;

        // 決定起點方：奇數局主在上、偶數局客在上（分析層簡化，不處理中途換邊）
        const top: 0|1 = (Number(r.game_index||0) % 2 === 1) ? 0 : 1;
        const startTeam: 0|1 = (sy < 0.5 ? top : (top ^ 1)) as 0|1;
        const color = startTeam === 0 ? BLUE : RED;

        const kind: 'win'|'loss' = r.winner_side === 'home' ? 'win' : 'loss';
        const meta = safeMeta(r.meta_json as any);
        return { sx, sy, ex, ey, kind, color, meta };
      })
      .filter(Boolean) as Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss'; color:string; meta?: any }>;

    setRoutes(items);

    if ((!rows || rows.length === 0) && (!ids || ids.length === 0)) {
      Alert.alert('沒有可播放的路線', '此場次目前沒有同時包含起點與落點的路線紀錄。');
    }
  } catch (e:any) {
    Alert.alert('載入失敗', String(e?.message || e));
  }
})();
}, [matchId, ids]);

const curMeta = routes[nowIndex]?.meta;

// 0.5x 切換
const toggleSpeedHalf = () => {
const next = !speedHalf;
setSpeedHalf(next);
playerRef.current?.setSpeed(next ? 0.5 : 1);
};

return (
<View style={{ flex: 1, padding: 12 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>路徑回放</Text>

  {/* 上方：篩選 Chips（唯一一組） */}
  <View style={{ flexDirection:'row', marginBottom: 8, flexWrap: 'wrap' }}>
    {(['all','win','loss','random'] as const).map(f=>(
      <Pressable
        key={f}
        onPress={()=>setFilter(f)}
        style={{
          paddingVertical:6, paddingHorizontal:10, borderRadius:14,
          borderWidth:1, borderColor: filter===f?'#1976d2':'#ccc',
          backgroundColor: filter===f?'rgba(25,118,210,0.1)':'#fff',
          marginRight:8, marginBottom:8
        }}
      >
        <Text>{f==='all'?'全部':f==='win'?'只播得分':f==='loss'?'只播失分':'隨機'}</Text>
      </Pressable>
    ))}
  </View>

  {/* 中間：播放器（外層自繪控制列，不遮畫面） */}
  <View style={{ flex: 1 }}>
    <FitPlayer
      routes={routes}
      filter={filter}
      onIndexChange={setNowIndex}
      onPlayingChange={setPlaying}
      playerRef={playerRef}
    />
  </View>

  {/* 下方：精簡控制列 + 新增功能鍵 */}
  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 10, flexWrap:'wrap' }}>
    <Text style={{ color:'#333', marginBottom:8 }}>{routes.length ? `第 ${nowIndex+1}/${routes.length} 球` : '無可播放路徑'}</Text>
    <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
      <Pressable onPress={()=>playerRef.current?.prev()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#424242', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>上</Text>
      </Pressable>
      <Pressable onPress={()=>playerRef.current?.toggle()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#1976d2', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>{playing ? '暫停' : '播放'}</Text>
      </Pressable>
      <Pressable onPress={()=>playerRef.current?.replay()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#455a64', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>重播</Text>
      </Pressable>
      <Pressable onPress={()=>playerRef.current?.next()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#424242', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>下</Text>
      </Pressable>

      {/* 新增：全部重播 */}
      <Pressable onPress={()=>playerRef.current?.restartAll()} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor:'#00695c', borderRadius:8, marginRight:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>全部重播</Text>
      </Pressable>

      {/* 新增：0.5x */}
      <Pressable onPress={toggleSpeedHalf} style={{ paddingVertical:8, paddingHorizontal:12, backgroundColor: speedHalf ? '#8e24aa' : '#9e9e9e', borderRadius:8, marginBottom:8 }}>
        <Text style={{ color:'#fff' }}>0.5x</Text>
      </Pressable>
    </View>
  </View>

  {/* 當前球的標籤（球種/主受迫/原因） */}
  {curMeta ? (
    <View style={{ marginTop: 10, flexDirection:'row', flexWrap:'wrap' }}>
      {curMeta.shotType && <Badge text={curMeta.shotType} />}
      {curMeta.forceType && <Badge text={curMeta.forceType} />}
      {curMeta.errorReason && <Badge text={curMeta.errorReason} />}
    </View>
  ) : null}

  {routes.length === 0 && (
    <Text style={{ marginTop: 8, color: '#666' }}>目前沒有可播放的路徑</Text>
  )}
</View>
);
}

/* 播放器外層：等比縮放 + 轉接 ref 與回呼 */
function FitPlayer({
routes, filter, onIndexChange, onPlayingChange, playerRef,
}: {
routes: any[];
filter: 'all'|'win'|'loss'|'random';
onIndexChange: (i:number)=>void;
onPlayingChange: (p:boolean)=>void;
playerRef: React.RefObject<RoutePlayerHandle>;
}) {
const [box, setBox] = React.useState({ w: 0, h: 0 });

const onLayout = (e: any) => {
const { width, height } = e.nativeEvent.layout;
if (width && height) setBox({ w: Math.floor(width), h: Math.floor(height) });
};

const ar = 6.1 / 13.4;
let w = 0, h = 0;
if (box.w > 0 && box.h > 0) {
const wByH = box.h * ar;
if (wByH <= box.w) { w = Math.floor(wByH); h = Math.floor(box.h); }
else { w = Math.floor(box.w); h = Math.floor(box.w / ar); }
}

return (
<View style={{ flex: 1 }} onLayout={onLayout}>
{w > 0 && h > 0 ? (
<View style={{ width: w, height: h, alignSelf: 'center' }}>
<RoutePlayer
ref={playerRef}
width={w}
height={h}
routes={routes}
autoPlay
initialSpeed={1}
filter={filter}
onIndexChange={onIndexChange}
onPlayingChange={onPlayingChange}
controls="none"            // 外層自畫控制列
showFilterChips={false}
/>
</View>
) : null}
</View>
);
}

function Badge({ text }: { text: string }) {
return (
<View style={{ paddingVertical:4, paddingHorizontal:8, borderRadius:12, backgroundColor:'#eee', marginRight:6, marginBottom:6 }}>
<Text>{text}</Text>
</View>
);
}

