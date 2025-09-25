import React from 'react';
import Svg, { Rect, Line } from 'react-native-svg';

type Props = {
width: number;
height: number;
};

const FULL_LEN = 13.4;
const FULL_WID = 6.1;
const SHORT_LINE_DIST = 1.98;
const DBL_LONG_BACK = 0.76;

export default function CourtBackground({ width, height }: Props) {
const midY = height / 2;
const midX = width / 2;
const sy = height / FULL_LEN;
const sx = width / FULL_WID;

const topShort = midY - SHORT_LINE_DIST * sy;
const bottomShort = midY + SHORT_LINE_DIST * sy;
const topDblLong = 0 + DBL_LONG_BACK * sy;
const bottomDblLong = height - DBL_LONG_BACK * sy;

const singleInnerW = 5.18 * sx;
const singleLeft = (width - singleInnerW) / 2;
const singleRight = width - singleLeft;

const line = '#f0e6da';
const lineW = Math.max(2, Math.round(Math.min(width, height) * 0.012));

return (
<Svg width={width} height={height}>
{/* 草地 */}
<Rect x={0} y={0} width={width} height={height} fill="#2e7d32" />

  {/* 外框 */}
  <Line x1={0} y1={0} x2={width} y2={0} stroke={line} strokeWidth={lineW} />
  <Line x1={0} y1={height} x2={width} y2={height} stroke={line} strokeWidth={lineW} />
  <Line x1={0} y1={0} x2={0} y2={height} stroke={line} strokeWidth={lineW} />
  <Line x1={width} y1={0} x2={width} y2={height} stroke={line} strokeWidth={lineW} />

  {/* 單打邊線 */}
  <Line x1={singleLeft} y1={0} x2={singleLeft} y2={height} stroke={line} strokeWidth={lineW} />
  <Line x1={singleRight} y1={0} x2={singleRight} y2={height} stroke={line} strokeWidth={lineW} />

  {/* 網 */}
  <Line x1={0} y1={midY} x2={width} y2={midY} stroke={line} strokeWidth={lineW} />

  {/* 短發球線 */}
  <Line x1={0} y1={topShort} x2={width} y2={topShort} stroke={line} strokeWidth={lineW} />
  <Line x1={0} y1={bottomShort} x2={width} y2={bottomShort} stroke={line} strokeWidth={lineW} />

  {/* 中央分界線（短發球線之上/之下） */}
  <Line x1={midX} y1={topShort} x2={midX} y2={0} stroke={line} strokeWidth={lineW} />
  <Line x1={midX} y1={bottomShort} x2={midX} y2={height} stroke={line} strokeWidth={lineW} />

  {/* 雙打長發球線 */}
  <Line x1={0} y1={topDblLong} x2={width} y2={topDblLong} stroke={line} strokeWidth={lineW} />
  <Line x1={0} y1={bottomDblLong} x2={width} y2={bottomDblLong} stroke={line} strokeWidth={lineW} />
</Svg>
);
}