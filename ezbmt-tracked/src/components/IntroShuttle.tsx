import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import Animated, {
useSharedValue,
useAnimatedStyle,
withRepeat,
withTiming,
Easing,
} from 'react-native-reanimated';

export default function IntroShuttle({ once = false }: { once?: boolean }) {
const { width } = useWindowDimensions();
const W = Math.min(width - 32, 560);
const H = 120;

const t = useSharedValue(0);

React.useEffect(() => {
const duration = 1600;
if (once) {
t.value = withTiming(1, { duration, easing: Easing.inOut(Easing.ease) });
} else {
t.value = withRepeat(
withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
-1,
true
);
}
}, [once, t]);

// 動畫中的羽球位置與旋轉
const shuttleStyle = useAnimatedStyle(() => {
const x = 16 + (W - 32) * t.value;
const y = H * 0.65 - Math.sin(Math.PI * t.value) * (H * 0.42);
const dy =
(-Math.cos(Math.PI * t.value) * (H * 0.42) * Math.PI) / (W - 32);
const angle = Math.atan2(dy, 1); // 弧度

return {
  transform: [
    { translateX: x },
    { translateY: y },
    { rotate: angle + 'rad' },
    { translateX: -12 },
    { translateY: -12 },
  ],
};
});

// 幫助產生 Path d（不用模板字串，避免貼上時出錯）
const line = (x1: number, y1: number, x2: number, y2: number) =>
'M' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
const quad = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) =>
'M' + x1 + ' ' + y1 + ' Q ' + cx + ' ' + cy + ' ' + x2 + ' ' + y2;

return (
<View style={{ width: W, height: H, alignSelf: 'center' }}>
<Svg width={W} height={H}>
{/* 背景淡線 */}
<Path
d={line(0, H * 0.7, W, H * 0.7)}
stroke="#f0e6da"
strokeWidth={2}
opacity={0.4}
/>
<Path
d={line(0, H * 0.9, W, H * 0.9)}
stroke="#f0e6da"
strokeWidth={2}
opacity={0.2}
/>

    {/* 參考拋物線（淡藍） */}
    <Path
      d={quad(16, H * 0.65, W / 2, H * 0.1, W - 16, H * 0.65)}
      stroke="#1976d2"
      strokeWidth={2}
      fill="none"
      opacity={0.25}
    />
  </Svg>

  <Animated.View
    style={[{ position: 'absolute', left: 0, top: 0 }, shuttleStyle]}
  >
    {/* 迷你羽球圖形 */}
    <Svg width={24} height={24} viewBox="0 0 48 48">
      <Circle cx="18" cy="18" r="9" fill="#fff" />
      <Line
        x1="18"
        y1="22"
        x2="6"
        y2="34"
        stroke="#fff"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1="22"
        y1="21"
        x2="11"
        y2="37"
        stroke="#fff"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1="26"
        y1="19"
        x2="17"
        y2="38"
        stroke="#fff"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle
        cx="18"
        cy="18"
        r="11"
        stroke="#1976d2"
        strokeWidth={1.5}
        fill="none"
        opacity={0.4}
      />
    </Svg>
  </Animated.View>
</View>
);
}