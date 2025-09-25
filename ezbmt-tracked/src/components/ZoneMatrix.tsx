import React from 'react';
import { View, Text } from 'react-native';

type Stat = { win: number; loss: number };
type Props = {
stats: Record<string, Stat>; // key: '1'..'6' | 'out'
showOut?: boolean;
title?: string;
};

export default function ZoneMatrix({ stats, showOut = true, title }: Props) {
// 顯示順序：1,2 | 5,6 | 3,4
const zones = ['1', '2', '5', '6', '3', '4'];
const outStat = stats['out'] || { win: 0, loss: 0 };

const totals = zones.map((z) => {
const st = stats[z] || { win: 0, loss: 0 };
return st.win + st.loss;
});
const maxTotal = Math.max(1, ...totals, showOut ? outStat.win + outStat.loss : 0);

// 量測外層容器寬度，避免百分比
const [wrapW, setWrapW] = React.useState(0);
const GAP = 8; // 兩欄之間的水平間隙（px）
const cellW = React.useMemo(() => {
if (!wrapW) return 0;
// 兩欄等寬（簡單切半，保留間隙）
return Math.floor((wrapW - GAP) / 2);
}, [wrapW]);

const renderCell = (z: string) => {
const st = stats[z] || { win: 0, loss: 0 };
const total = st.win + st.loss;
const alpha = total ? 0.15 + 0.6 * (total / maxTotal) : 0.1;
const bg = 'rgba(76,175,80,' + alpha + ')';
const winPct = total ? (st.win / total) * 100 : 0;

return (
  <View
    key={z}
    style={{
      width: cellW || undefined,
      aspectRatio: 1.2,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#eee',
      borderRadius: 10,
      padding: 8,
      backgroundColor: bg,
    }}
  >
    <Text style={{ fontWeight: '600', marginBottom: 4 }}>區 {z}</Text>
    <Text style={{ color: '#333' }}>總數：{total}</Text>

    <Progress pct={winPct} />

    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={{ color: '#1976d2' }}>得：{st.win}</Text>
      <Text style={{ color: '#d32f2f' }}>失：{st.loss}</Text>
    </View>
  </View>
);
};

const outTotal = outStat.win + outStat.loss;
const outWinPct = outTotal ? (outStat.win / outTotal) * 100 : 0;

return (
<View>
{title ? <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>{title}</Text> : null}

  <View
    style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}
    onLayout={(e) => setWrapW(Math.floor(e.nativeEvent.layout.width || 0))}
  >
    {zones.map(renderCell)}

    {showOut ? (
      <View style={{ width: wrapW || undefined, marginTop: 6 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#eee',
            borderRadius: 10,
            padding: 10,
            backgroundColor: '#fafafa',
          }}
        >
          <Text style={{ fontWeight: '600', marginBottom: 4 }}>界外（OUT）</Text>

          <Progress pct={outWinPct} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: '#1976d2' }}>得：{outStat.win}</Text>
            <Text style={{ color: '#d32f2f' }}>失：{outStat.loss}</Text>
          </View>
        </View>
      </View>
    ) : null}
  </View>
</View>
);
}

// 單純的進度條（不使用百分比寬度）
function Progress({ pct }: { pct: number }) {
const [trackW, setTrackW] = React.useState(0);
const innerW = Math.round(trackW * Math.max(0, Math.min(1, pct / 100)));

return (
<View
onLayout={(e) => setTrackW(Math.floor(e.nativeEvent.layout.width || 0))}
style={{
height: 10,
backgroundColor: '#eee',
borderRadius: 6,
overflow: 'hidden',
marginTop: 6,
}}
>
<View
style={{
width: innerW,
height: 10,
backgroundColor: '#2196f3',
}}
/>
</View>
);
}