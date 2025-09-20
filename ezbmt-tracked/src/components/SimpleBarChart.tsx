import React from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';

export type BarRow = { label: string; win: number; loss: number };

type Props = {
data: BarRow[];
maxItems?: number;
title?: string;
};

export default function SimpleBarChart({ data, maxItems = 8, title }: Props) {
const rows = data.slice(0, maxItems);
const maxVal = Math.max(1, ...rows.map(r => r.win + r.loss));

return (
<View>
{title ? <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>{title}</Text> : null}

  {rows.map((r) => (
    <BarRowItem key={r.label} row={r} maxVal={maxVal} />
  ))}
</View>
);
}

function BarRowItem({ row, maxVal }: { row: BarRow; maxVal: number }) {
const total = row.win + row.loss;
const [trackW, setTrackW] = React.useState(0); // px width of whole track

const onLayout = (e: LayoutChangeEvent) => {
const w = e.nativeEvent.layout.width || 0;
if (w !== trackW) setTrackW(Math.max(0, Math.floor(w)));
};

// bar 寬度（以 px 計算，不用百分比字串）
const barW = trackW * (total / maxVal);
const winW = total ? barW * (row.win / total) : 0;

return (
<View style={{ marginBottom: 10 }}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
<Text>{row.label}</Text>
<Text style={{ color: '#555' }}>{total} 次</Text>
</View>

  <View
    onLayout={onLayout}
    style={{
      alignSelf: 'stretch',
      height: 14,
      backgroundColor: '#eee',
      borderRadius: 8,
      overflow: 'hidden',
    }}
  >
    <View
      style={{
        width: barW,
        height: 14,
        backgroundColor: '#ffcdd2',
      }}
    >
      <View
        style={{
          width: winW,
          height: 14,
          backgroundColor: '#90caf9',
        }}
      />
    </View>
  </View>

  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
    <Text style={{ color: '#1976d2' }}>得：{row.win}</Text>
    <Text style={{ color: '#d32f2f' }}>失：{row.loss}</Text>
  </View>
</View>
);
}