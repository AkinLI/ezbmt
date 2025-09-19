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
      width: '48%',
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

    <View
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
          width: winPct + '%',
          backgroundColor: '#2196f3',
          height: '100%',
        }}
      />
    </View>

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

  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
    {zones.map(renderCell)}

    {showOut ? (
      <View style={{ width: '100%', marginTop: 6 }}>
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

          <View
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
                width: outWinPct + '%',
                backgroundColor: '#2196f3',
                height: '100%',
              }}
            />
          </View>

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