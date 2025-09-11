import React, { useMemo, useState, useCallback } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G, Circle } from 'react-native-svg';
import type { Orientation, Side, Zone, TapEvent, Point } from '../types';

type Marker = {
  id: string;
  rx: number; // portrait 基準相對座標（0..1，可超界）
  ry: number;
  kind: 'win' | 'loss';
};

type Props = {
  orientation: Orientation; // portrait: 上=away，下=home；landscape：左=home，右=away（整張左轉90°）
  singles: boolean;
  mode: 'tap' | 'route';
  routeStart: Point | null;
  routeHover: Point | null;
  onTap: (e: TapEvent) => void;
  onHover?: (p: Point | null) => void;
  // 顯示落點
  markers?: Marker[];
  onPressMarker?: (id: string) => void;
};

// 真實比例（雙打外框）
const FULL_LEN = 13.4; // 長
const FULL_WID = 6.1;  // 寬
const PORTRAIT_RATIO = FULL_WID / FULL_LEN; // width / height = 6.1/13.4
const LANDSCAPE_RATIO = FULL_LEN / FULL_WID; // width / height = 13.4/6.1

// 真實尺寸
const HALF_LEN = FULL_LEN / 2;   // 6.7
const SHORT_LINE_DIST = 1.98;    // 網到短發球線
const DBL_LONG_BACK = 0.76;      // 雙打長發球線至底線距
const SNG_WID = 5.18;            // 單打有效寬
const SIDE_GAP = (FULL_WID - SNG_WID) / 2; // 單打左右外側

export default function Court({
  orientation, singles, mode, routeStart, routeHover, onTap, onHover, markers = [], onPressMarker,
}: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  }, []);

  // 容器大小與比例（四周留可點界外緩衝）
  const draw = useMemo(() => {
    const { w: Wv, h: Hv } = box;
    if (Wv <= 0 || Hv <= 0) return { CW: 0, CH: 0, W: 0, H: 0, padX: 0, padY: 0, x: 0, y: 0 };

    const ratio = orientation === 'portrait' ? PORTRAIT_RATIO : LANDSCAPE_RATIO; // width/height
    let H = Hv * 0.9;
    let W = H * ratio;
    if (W > Wv * 0.96) {
      W = Wv * 0.96;
      H = W / ratio;
    }

    // 四周緩衝（界外可點）
    const padX = Math.round(W * 0.1);
    const padY = Math.round(H * 0.06);
    const CW = W + padX * 2;
    const CH = H + padY * 2;

    return {
      CW, CH,
      W, H,
      padX, padY,
      x: (Wv - CW) / 2,
      y: (Hv - CH) / 2,
    };
  }, [box, orientation]);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {draw.CW > 0 && (
        <CourtSurface
          containerW={draw.CW}
          containerH={draw.CH}
          width={draw.W}
          height={draw.H}
          padX={draw.padX}
          padY={draw.padY}
          offsetX={draw.x}
          offsetY={draw.y}
          orientation={orientation}
          singles={singles}
          mode={mode}
          routeStart={routeStart}
          routeHover={routeHover}
          onTap={onTap}
          onHover={onHover}
          markers={markers}
          onPressMarker={onPressMarker}
        />
      )}
    </View>
  );
}

function CourtSurface({
  containerW, containerH, width, height, padX, padY, offsetX, offsetY,
  orientation, singles, mode, routeStart, routeHover, onTap, onHover, markers, onPressMarker,
}: {
  containerW: number; containerH: number; width: number; height: number; padX: number; padY: number; offsetX: number; offsetY: number;
} & Props) {
  // 場地外框（不含界外緩衝）
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const innerX = padX + border;
  const innerY = padY + border;
  const innerW = width - border * 2;  // 雙打寬
  const innerH = height - border * 2; // 全長

  // px/m 比例
  const sx = innerW / FULL_WID;
  const sy = innerH / FULL_LEN;

  // 直式參考線（橫式也先以直式計算，再整張旋轉）
  const midY = innerY + innerH / 2;
  const midX = innerX + innerW / 2;
  const topBack = innerY;
  const bottomBack = innerY + innerH;
  const topShort = midY - SHORT_LINE_DIST * sy;
  const bottomShort = midY + SHORT_LINE_DIST * sy;
  const topDblLong = topBack + DBL_LONG_BACK * sy;
  const bottomDblLong = bottomBack - DBL_LONG_BACK * sy;
  const singleLeft = innerX + SIDE_GAP * sx;
  const singleRight = innerX + innerW - SIDE_GAP * sx;

  // 三排高度
  const halfH = innerH / 2;
  const frontH = SHORT_LINE_DIST * sy;
  const midH = (halfH - frontH) / 2;
  const backH = (halfH - frontH) / 2;

  // 有效寬（單/雙）
  const effX = singles ? singleLeft : innerX;
  const effW = singles ? (singleRight - singleLeft) : innerW;

  // portrait 基準區號：前=1/2，中=5/6，後=3/4（玩家右=奇）
  function zoneNumber(rowType: 0 | 1 | 2, isRightFromPlayer: boolean): Zone {
    const base = rowType === 0 ? 1 : (rowType === 1 ? 5 : 3);
    return (base + (isRightFromPlayer ? 0 : 1)) as Zone;
  }

  function RealCourt() {
    const frame = '#151515';
    const line = '#f0e6da';
    const grass = '#2e7d32';
    const lineW = Math.max(3, Math.round(Math.min(innerW, innerH) * 0.012));

    return (
      <>
        <Rect x={innerX} y={innerY} width={innerW} height={innerH} fill={grass} />
        <Rect x={innerX} y={innerY} width={innerW} height={innerH} fill="none" stroke={frame} strokeWidth={lineW} />
        {/* 單打邊線 */}
        <Line x1={singleLeft} y1={innerY} x2={singleLeft} y2={innerY + innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={singleRight} y1={innerY} x2={singleRight} y2={innerY + innerH} stroke={line} strokeWidth={lineW} />
        {/* 網 */}
        <Line x1={innerX} y1={midY} x2={innerX + innerW} y2={midY} stroke={line} strokeWidth={lineW} />
        {/* 短發球線 */}
        <Line x1={innerX} y1={topShort} x2={innerX + innerW} y2={topShort} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={bottomShort} x2={innerX + innerW} y2={bottomShort} stroke={line} strokeWidth={lineW} />
        {/* 中央分界線 */}
        <Line x1={midX} y1={topShort} x2={midX} y2={topBack} stroke={line} strokeWidth={lineW} />
        <Line x1={midX} y1={bottomShort} x2={midX} y2={bottomBack} stroke={line} strokeWidth={lineW} />
        {/* 雙打長發球線 */}
        <Line x1={innerX} y1={topDblLong} x2={innerX + innerW} y2={topDblLong} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={bottomDblLong} x2={innerX + innerW} y2={bottomDblLong} stroke={line} strokeWidth={lineW} />
      </>
    );
  }

  // 橫式點擊：把螢幕座標反轉回直式基準，再判定
  function unrotateForLandscape(x: number, y: number) {
    const cx = containerW / 2, cy = containerH / 2;
    const dx = x - cx, dy = y - cy;
    return { x: cx - dy, y: cy + dx }; // +90°
  }

  function classifyTapPortrait(px: number, py: number): TapEvent {
    const inOuter = px >= innerX && px <= innerX + innerW && py >= innerY && py <= innerY + innerH;

    // 直式：上=away、下=home（但「得分/失分」由 UI 規則決定）
    const side: Side = py < midY ? 'away' : 'home';

    const inSinglesX = px >= effX && px <= effX + effW;
    const inBounds = inOuter && inSinglesX;

    // row（離網距離）：前/中/後
    const relFromNet = side === 'home' ? (py - midY) : (midY - py);
    let rowType: 0 | 1 | 2;
    if (relFromNet < frontH) rowType = 0;
    else if (relFromNet < frontH + midH) rowType = 1;
    else rowType = 2;

    // 玩家右：home=螢幕右；away=螢幕左
    const cellW = (effW / 2);
    const col = Math.max(0, Math.min(1, Math.floor((px - effX) / cellW))) as 0 | 1;
    const isRightFromPlayer = side === 'home' ? (col === 1) : (col === 0);
    const zone = zoneNumber(rowType, isRightFromPlayer);

    // portrait 基準相對座標（0..1，可超界）
    const rx = (px - innerX) / innerW;
    const ry = (py - innerY) / innerH;

    return { side, zone, point: { x: px, y: py }, norm: { x: rx, y: ry }, inBounds };
  }

  function classifyTap(x: number, y: number): TapEvent {
    if (orientation === 'portrait') {
      return classifyTapPortrait(x, y);
    } else {
      const r = unrotateForLandscape(x, y);
      return classifyTapPortrait(r.x, r.y);
    }
  }

  // 觸控 overlay（包含界外）
  const onResponderMove = (evt: any) => {
    if (!routeStart || mode !== 'route') return;
    const { locationX, locationY } = evt?.nativeEvent || {};
    if (typeof locationX !== 'number' || typeof locationY !== 'number') return;
    onHover?.({ x: locationX, y: locationY });
  };
  const onResponderRelease = (evt: any) => {
    const { locationX, locationY } = evt?.nativeEvent || {};
    if (typeof locationX !== 'number' || typeof locationY !== 'number') return;

    // 先判斷是否點到既有標記
    const portraitPt = orientation === 'portrait'
      ? { x: locationX, y: locationY }
      : unrotateForLandscape(locationX, locationY);

    if (onPressMarker && markers && markers.length) {
      // 將 marker portrait 相對座標轉 px，再做距離判定
      const near = markers.find(m => {
        const mx = innerX + m.rx * innerW;
        const my = innerY + m.ry * innerH;
        const dx = portraitPt.x - mx;
        const dy = portraitPt.y - my;
        return (dx*dx + dy*dy) <= (16*16); // 半徑 ~16px
      });
      if (near) {
        onPressMarker(near.id);
        return;
      }
    }

    onTap(classifyTap(locationX, locationY));
    onHover?.(null);
  };

  // 區塊淡色疊加（辨識用）
  function renderZonesPortrait(side: Side) {
    const isAway = side === 'away';
    const rowsH = isAway ? [backH, midH, frontH] : [frontH, midH, backH];
    const startY = isAway ? innerY : midY;
    const cellW = (effW / 2);
    let y = startY;
    const nodes: any[] = [];

    for (let i = 0; i < 3; i++) {
      const rowH = rowsH[i];
      const xLeft = effX, xRight = effX + cellW;

      const rowType: 0 | 1 | 2 = isAway ? ((i === 0 ? 2 : i === 1 ? 1 : 0) as 0 | 1 | 2) : (i as 0 | 1 | 2);
      const rightLabel = zoneNumber(rowType, true);
      const leftLabel = zoneNumber(rowType, false);
      const leftZone = isAway ? rightLabel : leftLabel;
      const rightZone = isAway ? leftLabel : rightLabel;

      nodes.push(
        <G key={side + '-row' + i + '-L'}>
          <Rect x={xLeft} y={y} width={cellW} height={rowH} fill={side === 'home' ? 'rgba(76,175,80,0.12)' : 'rgba(244,67,54,0.12)'} />
          <SvgText x={xLeft + cellW / 2} y={y + rowH / 2} fontSize={Math.min(cellW, rowH) * 0.35} fill="#222" textAnchor="middle" alignmentBaseline="middle">
            {String(leftZone)}
          </SvgText>
        </G>
      );
      nodes.push(
        <G key={side + '-row' + i + '-R'}>
          <Rect x={xRight} y={y} width={cellW} height={rowH} fill={side === 'home' ? 'rgba(76,175,80,0.12)' : 'rgba(244,67,54,0.12)'} />
          <SvgText x={xRight + cellW / 2} y={y + rowH / 2} fontSize={Math.min(cellW, rowH) * 0.35} fill="#222" textAnchor="middle" alignmentBaseline="middle">
            {String(rightZone)}
          </SvgText>
        </G>
      );

      y += rowH;
    }
    return nodes;
  }

  // 標記（藍=得分、紅=失分；在同一個旋轉群組內，會隨場地旋轉）
  function renderMarkers() {
    if (!markers || markers.length === 0) return null;
    const R = Math.max(6, Math.round(Math.min(innerW, innerH) * 0.015)); // radius
    return markers.map((m) => {
      const px = innerX + m.rx * innerW;
      const py = innerY + m.ry * innerH;
      const fill = m.kind === 'win' ? 'rgba(33,150,243,0.5)' : 'rgba(244,67,54,0.5)';
      const stroke = m.kind === 'win' ? 'rgba(33,150,243,0.9)' : 'rgba(244,67,54,0.9)';
      return <Circle key={m.id} cx={px} cy={py} r={R} fill={fill} stroke={stroke} strokeWidth={2} />;
    });
  }

  return (
    <View style={{ width: containerW, height: containerH, marginLeft: offsetX, marginTop: offsetY }}>
      <Svg width={containerW} height={containerH} viewBox={'0 0 ' + containerW + ' ' + containerH}>
        <G transform={orientation === 'landscape' ? `rotate(-90 ${containerW / 2} ${containerH / 2})` : undefined}>
          {RealCourt()}
          {renderZonesPortrait('away')}
          {renderZonesPortrait('home')}
          {renderMarkers()}
          {routeStart && (
            <>
              <Circle cx={routeStart.x} cy={routeStart.y} r={12} fill="#1976d2" />
              {routeHover && (
                <>
                  <Line x1={routeStart.x} y1={routeStart.y} x2={routeHover.x} y2={routeHover.y} stroke="#1976d2" strokeWidth={6} strokeDasharray="12,8" opacity={0.85} />
                  <Circle cx={routeHover.x} cy={routeHover.y} r={10} fill="#1976d2" opacity={0.9} />
                </>
              )}
            </>
          )}
        </G>
      </Svg>

      {/* 透明 overlay：包含界外，捕捉點擊與點選標記 */}
      <View
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        pointerEvents="box-only"
        onStartShouldSetResponder={() => true}
        onResponderMove={onResponderMove}
        onResponderRelease={onResponderRelease}
      />
    </View>
  );
}
