import React from 'react';
import { requireNativeComponent, type ViewProps, type NativeSyntheticEvent } from 'react-native';

export type NativeSample = { x: number; y: number; ts: number; w: number; h: number; score: number };

type Props = ViewProps & {
isActive?: boolean;
onSample?: (e: NativeSyntheticEvent<NativeSample>) => void;
yMin?: number;
chromaMax?: number;
blockSize?: number;
roiPad?: number;
};

const RNSpeedCamView = requireNativeComponent<Props>('RNSpeedCamView');
export default RNSpeedCamView;