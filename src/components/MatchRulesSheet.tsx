import React from 'react';
import { View, Text, Modal, Pressable, Switch, Platform, ActionSheetIOS, Alert } from 'react-native';

type Rules = { bestOf: number; pointsToWin: number; deuce: boolean; cap?: number | null };

type Props = {
visible: boolean;
initial: Rules;
onClose: () => void;
onSave: (rules: Rules) => void;
};

// 可調整的選單
const BEST_OF_OPTIONS = [1, 3, 5] as const;
const POINTS_OPTIONS = [11, 15, 21] as const;
const CAP_OPTIONS = [null, 30] as const; // null=無封頂

export default function MatchRulesSheet({ visible, initial, onClose, onSave }: Props) {
const [bestOf, setBestOf] = React.useState<number>(initial.bestOf);
const [points, setPoints] = React.useState<number>(initial.pointsToWin);
const [deuce, setDeuce] = React.useState<boolean>(initial.deuce);
const [cap, setCap] = React.useState<number | null>(initial.cap ?? 30);

React.useEffect(() => {
if (visible) {
setBestOf(initial.bestOf);
setPoints(initial.pointsToWin);
setDeuce(initial.deuce);
setCap(initial.cap ?? 30);
}
}, [visible, initial]);

const openPicker = <T extends number | null>(
title: string,
options: readonly T[],
format: (v: T) => string,
onSelected: (v: T) => void
) => {
if (Platform.OS === 'ios') {
const labels = options.map(format);
ActionSheetIOS.showActionSheetWithOptions(
{ title, options: [...labels, '取消'], cancelButtonIndex: labels.length },
(idx) => {
if (idx != null && idx >= 0 && idx < labels.length) onSelected(options[idx]);
}
);
} else {
// Android：用 Alert 選單
Alert.alert(
title,
'',
[
...options.map((v) => ({ text: format(v), onPress: () => onSelected(v) })),
{ text: '取消', style: 'cancel' },
],
{ cancelable: true }
);
}
};

return (
<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
<View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>比賽規則</Text>

      <Row label="Best of (1/3/5)">
        <PickerButton
          text={String(bestOf)}
          onPress={() =>
            openPicker('Best of', BEST_OF_OPTIONS, (v) => String(v), (v) => setBestOf(v))
          }
        />
      </Row>

      <Row label="每局目標分 (11/15/21)">
        <PickerButton
          text={String(points)}
          onPress={() =>
            openPicker('每局目標分', POINTS_OPTIONS, (v) => String(v), (v) => setPoints(v))
          }
        />
      </Row>

      <Row label="Deuce（需領先2分）">
        <Switch value={deuce} onValueChange={setDeuce} />
      </Row>

      <Row label="封頂分（cap；30=29平搶1；空白=無封頂）">
        <PickerButton
          text={cap == null ? '無封頂' : String(cap)}
          onPress={() =>
            openPicker('封頂分', CAP_OPTIONS, (v) => (v == null ? '無封頂' : String(v)), (v) => setCap(v))
          }
        />
      </Row>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 }}>
        <Pressable onPress={onClose} style={{ padding: 12, marginRight: 8 }}>
          <Text>取消</Text>
        </Pressable>
        <Pressable
          onPress={() => onSave({ bestOf, pointsToWin: points, deuce, cap })}
          style={{ padding: 12, backgroundColor: '#1976d2', borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>儲存</Text>
        </Pressable>
      </View>
    </View>
  </View>
</Modal>
);
}

function Row({ label, children }: any) {
return (
<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
<Text style={{ width: 180 }}>{label}</Text>
{children}
</View>
);
}

function PickerButton({ text, onPress }: { text: string; onPress: () => void }) {
return (
<Pressable
onPress={onPress}
style={{
minWidth: 100,
paddingVertical: 8,
paddingHorizontal: 12,
borderWidth: 1,
borderColor: '#ccc',
borderRadius: 8,
backgroundColor: '#fff',
}}
>
<Text>{text}</Text>
</Pressable>
);
}