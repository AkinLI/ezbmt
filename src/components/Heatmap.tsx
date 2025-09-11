import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Circle } from 'react-native-svg';

type Pt = { rx: number; ry: number; kind: 'win' | 'loss' };
type Props = {
width: number;
height: number;
points: Pt[]; // portrait 相對座標，允許 <0 或 >1（界外）
dotRadius?: number;
blur?: boolean; // 預留：漸層熱區（此版先畫散點）
};

export default function Heatmap({ width, height, points, dotRadius = 6 }: Props) {
// 有界裁切（只顯示場內點；界外點可選擇另外顯示）
const inside = useMemo(
() => points.filter(p => p.rx >= 0 && p.rx <= 1 && p.ry >= 0 && p.ry <= 1),
[points]
);

return (
<View style={{ width, height }}>
<Svg width={width} height={height}>
<Rect x={0} y={0} width={width} height={height} fill="transparent" />
{inside.map((p, idx) => {
const x = p.rx * width;
const y = p.ry * height;
const fill = p.kind === 'win' ? 'rgba(33,150,243,0.45)' : 'rgba(244,67,54,0.45)';
const stroke = p.kind === 'win' ? 'rgba(33,150,243,0.9)' : 'rgba(244,67,54,0.9)';
return <Circle key={idx} cx={x} cy={y} r={dotRadius} fill={fill} stroke={stroke} strokeWidth={2} />;
})}
</Svg>
</View>
);
}
