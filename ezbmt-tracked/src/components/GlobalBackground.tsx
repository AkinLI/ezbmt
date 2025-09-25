import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { useBgStore } from '../store/bg';

// 有上傳用使用者圖片，沒上傳用預設圖
const DEFAULT_BG = require('../images/bg_default.jpg');

export default function GlobalBackground() {
const uri = useBgStore(s => s.uri);
const opacity = useBgStore(s => s.opacity);
const source = uri ? { uri } : DEFAULT_BG;

return (
<View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
<Image
source={source}
style={[StyleSheet.absoluteFillObject, { opacity }]}
resizeMode="cover"  // 中心裁切
/>
</View>
);
}