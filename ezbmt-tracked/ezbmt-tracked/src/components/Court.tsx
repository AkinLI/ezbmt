import React, { useMemo, useState, useCallback } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G, Circle } from 'react-native-svg';
import type { Orientation, Side, Zone, TapEvent, Point } from '../types';

type Marker = {
  id: string;
  rx: number;
  ry: number;
  kind: 'win' | 'loss';
};

type OverlayPositions = {
  A: { right: 0 | 1; left: 0 | 1 };
  B: { right: 0 | 1; left: 0 | 1 };
};

type Props = {
  orientation: Orientation;
  singles: boolean;
  mode: 'tap' | 'route';
  routeStart: Point | null;
  routeHover: Point | null;
  onTap: (e: TapEvent) => void;
  onHover?: (p: Point | null) => void;
  markers?: Marker[];
  onPressMarker?: (id: string) => void;

  // 站位疊加
  overlay?: {
    homeRight?: string;
    homeLeft?: string;
    awayRight?: string;
    awayLeft?: string;
    server?: { team: 0 | 1; index: 0 | 1 };
    receiver?: { team: 0 | 1; index: 0 | 1 };
    positions?: OverlayPositions;
    opacity?: number;
  };

  // 新增：父層控制的黑點（以 Court 內部座標 px）
  focusPoint?: { x: number; y: number } | null;
};

/* 球場比例 */
const FULL_LEN = 13.4;
const FULL_WID = 6.1;
const PORTRAIT_RATIO = FULL_WID / FULL_LEN;
const LANDSCAPE_RATIO = FULL_LEN / FULL_WID;

/* 實際尺寸 */
const SHORT_LINE_DIST = 1.98;
const DBL_LONG_BACK = 0.76;
const SNG_WID = 5.18;
const SIDE_GAP = (FULL_WID - SNG_WID) / 2;

export default function Court({
  orientation, singles, mode, routeStart, routeHover, onTap, onHover, markers = [], onPressMarker, overlay, focusPoint,
}: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  }, []);

  const draw = useMemo(() => {
    const { w: Wv, h: Hv } = box;
    if (Wv <= 0 || Hv <= 0) return { CW: 0, CH: 0, W: 0, H: 0, padX: 0, padY: 0, x: 0, y: 0 };
    const ratio = orientation === 'portrait' ? PORTRAIT_RATIO : LANDSCAPE_RATIO;
    let H = Hv * 0.9;
    let W = H * ratio;
    if (W > Wv * 0.96) {
      W = Wv * 0.96;
      H = W / ratio;
    }
    const padX = Math.round(W * 0.1);
    const padY = Math.round(H * 0.06);
    const CW = W + padX * 2;
    const CH = H + padY * 2;
    return { CW, CH, W, H, padX, padY, x: (Wv - CW) / 2, y: (Hv - CH) / 2 };
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
          overlay={overlay}
          focusPoint={focusPoint}
        />
      )}
    </View>
  );
}

function CourtSurface({
  containerW, containerH, width, height, padX, padY, offsetX, offsetY,
  orientation, singles, mode, routeStart, routeHover, onTap, onHover, markers, onPressMarker, overlay, focusPoint,
}: {
  containerW: number; containerH: number; width: number; height: number; padX: number; padY: number; offsetX: number; offsetY: number;
} & Props) {
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const innerX = padX + border;
  const innerY = padY + border;
  const innerW = width - border * 2;
  const innerH = height - border * 2;

  const sx = innerW / FULL_WID;
  const sy = innerH / FULL_LEN;

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

  const halfH = innerH / 2;
  const frontH = SHORT_LINE_DIST * sy;
  const midH = (halfH - frontH) / 2;
  const backH = (halfH - frontH) / 2;

  const effX = singles ? singleLeft : innerX;
  const effW = singles ? (singleRight - singleLeft) : innerW;

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
        <Line x1={singleLeft} y1={innerY} x2={singleLeft} y2={innerY + innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={singleRight} y1={innerY} x2={singleRight} y2={innerY + innerH} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={midY} x2={innerX + innerW} y2={midY} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={topShort} x2={innerX + innerW} y2={topShort} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={bottomShort} x2={innerX + innerW} y2={bottomShort} stroke={line} strokeWidth={lineW} />
        <Line x1={midX} y1={topShort} x2={midX} y2={topBack} stroke={line} strokeWidth={lineW} />
        <Line x1={midX} y1={bottomShort} x2={midX} y2={bottomBack} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={topDblLong} x2={innerX + innerW} y2={topDblLong} stroke={line} strokeWidth={lineW} />
        <Line x1={innerX} y1={bottomDblLong} x2={innerX + innerW} y2={bottomDblLong} stroke={line} strokeWidth={lineW} />
      </>
    );
  }

  function unrotateForLandscape(x: number, y: number) {
    const cx = containerW / 2, cy = containerH / 2;
    const dx = x - cx, dy = y - cy;
    return { x: cx - dy, y: cy + dx };
  }

  function classifyTapPortrait(px: number, py: number): TapEvent {
    const inOuter = px >= innerX && px <= innerX + innerW && py >= innerY && py <= innerY + innerH;
    const side: Side = py < midY ? 'away' : 'home';

    const inSinglesX = px >= effX && px <= effX + effW;
    const inBounds = inOuter && inSinglesX;

    const relFromNet = side === 'home' ? (py - midY) : (midY - py);
    let rowType: 0 | 1 | 2;
    if (relFromNet < frontH) rowType = 0;
    else if (relFromNet < frontH + midH) rowType = 1;
    else rowType = 2;

    const cellW = (effW / 2);
    const col = Math.max(0, Math.min(1, Math.floor((px - effX) / cellW))) as 0 | 1;
    const isRightFromPlayer = side === 'home' ? (col === 1) : (col === 0);
    const zone = zoneNumber(rowType, isRightFromPlayer);

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

  const onResponderMove = (evt: any) => {
    if (!routeStart || mode !== 'route') return;
    const { locationX, locationY } = evt?.nativeEvent || {};
    if (typeof locationX !== 'number' || typeof locationY !== 'number') return;
    onHover?.({ x: locationX, y: locationY });
  };

  const onResponderRelease = (evt: any) => {
    const { locationX, locationY } = evt?.nativeEvent || {};
    if (typeof locationX !== 'number' || typeof locationY !== 'number') return;

    const portraitPt = orientation === 'portrait'
      ? { x: locationX, y: locationY }
      : unrotateForLandscape(locationX, locationY);

    if (onPressMarker && markers && markers.length) {
      const near = markers.find(m => {
        const mx = innerX + m.rx * innerW;
        const my = innerY + m.ry * innerH;
        const dx = portraitPt.x - mx;
        const dy = portraitPt.y - my;
        return (dx*dx + dy*dy) <= (16*16);
      });
      if (near) { onPressMarker(near.id); return; }
    }

    onTap(classifyTap(locationX, locationY));
    onHover?.(null);
  };

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

  function renderMarkers() {
    if (!markers || markers.length === 0) return null;
    const R = Math.max(6, Math.round(Math.min(innerW, innerH) * 0.015));
    return markers.map((m) => {
      const px = innerX + m.rx * innerW;
      const py = innerY + m.ry * innerH;
      const fill = m.kind === 'win' ? 'rgba(33,150,243,0.5)' : 'rgba(244,67,54,0.5)';
      const stroke = m.kind === 'win' ? 'rgba(33,150,243,0.9)' : 'rgba(244,67,54,0.9)';
      return <Circle key={m.id} cx={px} cy={py} r={R} fill={fill} stroke={stroke} strokeWidth={2} />;
    });
  }

  function textW(txt: string, fs: number) {
    const n = (txt || '').length;
    return Math.max(24, Math.round(n * fs * 0.58));
  }
  function NameBadge({ x, y, label, fs, mark }: { x: number; y: number; label: string; fs: number; mark?: 'S' | 'R' }) {
    const padX = 10, padY = 6;
    const w = textW(label, fs) + padX * 2;
    const h = fs + padY * 2;
    const rx = 10;
    const bg = 'rgba(0,0,0,0.35)';
    return (
      <G>
        <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={rx} ry={rx} fill={bg} />
        <SvgText x={x} y={y} fontSize={fs} fill="#fff" textAnchor="middle" alignmentBaseline="middle">
          {label || ''}
        </SvgText>
        {mark ? (
          <G>
            <Circle cx={x + w / 2 - 12} cy={y - h / 2 + 12} r={10} fill={mark === 'S' ? '#1976d2' : '#d32f2f'} />
            <SvgText x={x + w / 2 - 12} y={y - h / 2 + 12} fontSize={10} fill="#fff" textAnchor="middle" alignmentBaseline="middle">
              {mark}
            </SvgText>
          </G>
        ) : null}
      </G>
    );
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

          {/* 疊加名牌 */}
          {(() => {
            if (!overlay) return null;
            const fs = Math.max(12, Math.round(Math.min(innerW, innerH) * 0.04));
            const cellW = (singles ? (singleRight - singleLeft) : innerW) / 2;
            const ex = singles ? singleLeft : innerX;
            const xLeft = ex + cellW / 2;
            const xRight = ex + cellW * 1.5;
            const yAway = innerY + innerH * 0.25;
            const yHome = innerY + innerH * 0.75;

            const pos = overlay.positions;
            const srv = overlay.server;
            const rcv = overlay.receiver;
            const markOf = (team: 0 | 1, side: 'R' | 'L'): 'S' | 'R' | undefined => {
              const map = team === 0 ? pos?.A : pos?.B;
              const at = side === 'R' ? map?.right : map?.left;
              if (srv && srv.team === team && srv.index === at) return 'S';
              if (rcv && rcv.team === team && rcv.index === at) return 'R';
              return undefined;
            };

            return (
              <>
                {!!overlay.awayRight && <NameBadge x={xLeft}  y={yAway} label={overlay.awayRight} fs={fs} mark={markOf(1,'R')} />}
                {!!overlay.awayLeft  && <NameBadge x={xRight} y={yAway} label={overlay.awayLeft } fs={fs} mark={markOf(1,'L')} />}
                {!!overlay.homeLeft  && <NameBadge x={xLeft}  y={yHome} label={overlay.homeLeft } fs={fs} mark={markOf(0,'L')} />}
                {!!overlay.homeRight && <NameBadge x={xRight} y={yHome} label={overlay.homeRight} fs={fs} mark={markOf(0,'R')} />}
              </>
            );
          })()}

          {/* 受控黑點（直到父層清除） */}
          {focusPoint ? <Circle cx={focusPoint.x} cy={focusPoint.y} r={10} fill="rgba(0,0,0,0.85)" /> : null}
        </G>
      </Svg>

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