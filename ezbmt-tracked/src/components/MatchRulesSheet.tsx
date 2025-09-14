import React from 'react';
import { View, Text, Modal, Pressable, TextInput, Switch } from 'react-native';

type Rules = { bestOf: number; pointsToWin: number; deuce: boolean; cap?: number | null };

type Props = {
visible: boolean;
initial: Rules;
onClose: () => void;
onSave: (rules: Rules) => void;
};

export default function MatchRulesSheet({ visible, initial, onClose, onSave }: Props) {
const [bestOf, setBestOf] = React.useState(initial.bestOf);
const [points, setPoints] = React.useState(initial.pointsToWin);
const [deuce, setDeuce] = React.useState(initial.deuce);
const [cap, setCap] = React.useState<number | null>(initial.cap ?? 30);

React.useEffect(() => {
if (visible) {
setBestOf(initial.bestOf);
setPoints(initial.pointsToWin);
setDeuce(initial.deuce);
setCap(initial.cap ?? 30);
}
}, [visible, initial]);

return (
<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
<View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
<Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>比賽規則</Text>

      <Row label="Best of (1/3/5)">
        <TextInput
          keyboardType="number-pad"
          value={String(bestOf)}
          onChangeText={(t) => setBestOf(Number(t) || 1)}
          style={inp}
        />
      </Row>

      <Row label="每局目標分 (11/15/21)">
        <TextInput
          keyboardType="number-pad"
          value={String(points)}
          onChangeText={(t) => setPoints(Number(t) || 21)}
          style={inp}
        />
      </Row>

      <Row label="Deuce（需領先2分）">
        <Switch value={deuce} onValueChange={setDeuce} />
      </Row>

      <Row label="封頂分 (cap，30=29平搶1；空白=無封頂)">
        <TextInput
          keyboardType="number-pad"
          value={cap == null ? '' : String(cap)}
          onChangeText={(t) => setCap(t === '' ? null : (Number(t) || 30))}
          style={inp}
        />
      </Row>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
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
<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
<Text style={{ width: 180 }}>{label}</Text>
{children}
</View>
);
}

const inp = {
borderWidth: 1,
borderColor: '#ccc',
borderRadius: 8,
paddingHorizontal: 10,
paddingVertical: 8,
minWidth: 100,
};
