import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

type Pt = { rx: number; ry: number; kind: 'win' | 'loss' };
type Props = {
width: number;
height: number;
points: Pt[]; // portrait 相對座標
grid: number; // 每格邊長（px）
mode?: 'all' | 'win' | 'loss';
};

export default function HeatGrid({ width, height, points, grid, mode = 'all' }: Props) {
const { cols, rows, cells, maxWin, maxLoss } = useMemo(() => {
const cols = Math.max(1, Math.floor(width / grid));
const rows = Math.max(1, Math.floor(height / grid));
const cells: Array<Array<{ win: number; loss: number }>> = Array.from({ length: rows }, () =>
Array.from({ length: cols }, () => ({ win: 0, loss: 0 }))
);
let maxWin = 0, maxLoss = 0;

for (let i = 0; i < points.length; i++) {
  const p = points[i];
  if (p.rx < 0 || p.rx > 1 || p.ry < 0 || p.ry > 1) continue;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.rx * cols)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.ry * rows)));
  if (p.kind === 'win') cells[cy][cx].win += 1; else cells[cy][cx].loss += 1;
  if (cells[cy][cx].win > maxWin) maxWin = cells[cy][cx].win;
  if (cells[cy][cx].loss > maxLoss) maxLoss = cells[cy][cx].loss;
}
return { cols, rows, cells, maxWin, maxLoss };
}, [width, height, points, grid]);

const cellW = width / cols;
const cellH = height / rows;

return (
<View style={{ width, height }}>
<Svg width={width} height={height}>
{cells.map((row, y) =>
row.map((c, x) => {
if (c.win === 0 && c.loss === 0) return null;
let fill = 'transparent';
let alpha = 0;

        if (mode === 'win') {
          alpha = maxWin ? c.win / maxWin : 0;
          fill = `rgba(33,150,243,${0.15 + 0.55 * alpha})`;
        } else if (mode === 'loss') {
          alpha = maxLoss ? c.loss / maxLoss : 0;
          fill = `rgba(244,67,54,${0.15 + 0.55 * alpha})`;
        } else {
          const aWin = maxWin ? c.win / maxWin : 0;
          const aLoss = maxLoss ? c.loss / maxLoss : 0;
          if (aWin >= aLoss) {
            fill = `rgba(33,150,243,${0.15 + 0.55 * aWin})`;
          } else {
            fill = `rgba(244,67,54,${0.15 + 0.55 * aLoss})`;
          }
        }

        return (
          <Rect
            key={`${x}-${y}`}
            x={x * cellW}
            y={y * cellH}
            width={cellW}
            height={cellH}
            fill={fill}
          />
        );
      })
    )}
  </Svg>
</View>
);
}