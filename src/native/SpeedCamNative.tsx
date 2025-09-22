import React from 'react';
import { requireNativeComponent, type ViewProps, type NativeSyntheticEvent } from 'react-native';

export type NativeSample = { x: number; y: number; ts: number; w: number; h: number; score: number };

type Props = ViewProps & {
isActive?: boolean;
onSample?: (e: NativeSyntheticEvent<NativeSample>) => void;
};

const RNSpeedCamView = requireNativeComponent<Props>('RNSpeedCamView');
export default RNSpeedCamView;