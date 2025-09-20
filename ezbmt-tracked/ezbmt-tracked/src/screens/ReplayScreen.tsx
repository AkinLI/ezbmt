import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getRalliesByIds } from '../db';
import RoutePlayer from '../components/RoutePlayer';

type RouteParam = { matchId: string; ids: string[] };

export default function ReplayScreen() {
const route = useRoute<any>();
const { matchId, ids } = (route.params || {}) as RouteParam;

const [routes, setRoutes] = React.useState<Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss'; meta?: any }>>([]);
const [filter, setFilter] = React.useState<'all'|'win'|'loss'|'random'>('all');
const [nowIndex, setNowIndex] = React.useState(0);

React.useEffect(() => {
(async () => {
try {
if (!ids || !ids.length) return;
const rows = await getRalliesByIds(ids);
const items = rows
.map((r: any) => {
const sx = r.route_start_rx != null ? Number(r.route_start_rx) : null;
const sy = r.route_start_ry != null ? Number(r.route_start_ry) : null;
const ex = r.route_end_rx != null ? Number(r.route_end_rx) : null;
const ey = r.route_end_ry != null ? Number(r.route_end_ry) : null;
if (sx == null || sy == null || ex == null || ey == null) return null;
const kind = r.winner_side === 'home' ? 'win' : 'loss';
const meta = safeMeta(r.meta_json);
return { sx, sy, ex, ey, kind, meta };
})
.filter(Boolean) as Array<{ sx:number; sy:number; ex:number; ey:number; kind:'win'|'loss'; meta?: any }>;
setRoutes(items);
} catch (e: any) {
Alert.alert('載入失敗', String(e?.message || e));
}
})();
}, [matchId, ids]);

const curMeta = routes[nowIndex]?.meta;

return (
<View style={{ flex: 1, padding: 12 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>路徑回放</Text>

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

  {/* 讓播放器吃掉剩餘空間，內部會等比縮放到不超出容器 */}
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <FitPlayer routes={routes} filter={filter} onIndexChange={setNowIndex} />
  </View>

  {curMeta ? (
    <View style={{ marginTop: 10, flexDirection:'row', flexWrap:'wrap' }}>
      {curMeta.shotType && <Badge text={curMeta.shotType} />}
      {curMeta.forceType && <Badge text={curMeta.forceType} />}
      {curMeta.errorReason && <Badge text={curMeta.errorReason} />}
    </View>
  ) : null}
  {routes.length === 0 && <Text style={{ marginTop: 8, color: '#666' }}>目前沒有可播放的路徑</Text>}
</View>
);
}

/**

在可用空間內「等比縮放」RoutePlayer（6.1:13.4，直式）
取得容器寬高，算出不超出容器的寬高，置中顯示 */ function FitPlayer({ routes, filter, onIndexChange, }: { routes: any[]; filter: 'all'|'win'|'loss'|'random'; onIndexChange: (i:number)=>void }) { const [box, setBox] = React.useState({ w: 0, h: 0 });
const onLayout = (e: any) => {
const { width, height } = e.nativeEvent.layout;
if (width && height) setBox({ w: Math.floor(width), h: Math.floor(height) });
};

// 直式球場比例（width/height）
const ar = 6.1 / 13.4;

// 依容器等比縮放（取不超出容器的最大尺寸）
let w = 0, h = 0;
if (box.w > 0 && box.h > 0) {
const wByH = box.h * ar;            // 用高度推算的最大寬
if (wByH <= box.w) {
// 以高度為限制
w = Math.floor(wByH);
h = Math.floor(box.h);
} else {
// 以寬度為限制
w = Math.floor(box.w);
h = Math.floor(box.w / ar);
}
}

return (
<View style={{ width: '100%', height: '100%' }} onLayout={onLayout}>
{w > 0 && h > 0 ? (
<View style={{ width: w, height: h, alignSelf: 'center' }}>
<RoutePlayer
         width={w}
         height={h}
         routes={routes}
         autoPlay
         initialSpeed={1}
         filter={filter}
         onIndexChange={onIndexChange}
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
function safeMeta(json: string) { try { return JSON.parse(json || '{}'); } catch(_){ return {}; } }