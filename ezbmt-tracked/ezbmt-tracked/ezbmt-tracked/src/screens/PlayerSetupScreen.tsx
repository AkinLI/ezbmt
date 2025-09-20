import React from 'react';
import {
View,
Text,
TextInput,
Pressable,
Alert,
ScrollView,
KeyboardAvoidingView,
Platform,
LayoutChangeEvent,
NativeSyntheticEvent,
NativeScrollEvent,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMatch, getMatchPlayers, upsertMatchPlayers, updateStartConfigs } from '../db';

const C = {
bg: '#111',
card: '#222',
border: '#333',
field: '#111',
fieldBorder: '#444',
text: '#fff',
sub: '#ddd',
hint: '#888',
chipOn: '#90caf9',
chipOff: '#555',
};

type PlayerForm = { name: string; gender: 'M' | 'F' | 'U'; handedness: 'L' | 'R' | 'U' };

export default function PlayerSetupScreen() {
const route = useRoute<any>();
const navigation = useNavigation<any>();
const matchId = route.params.matchId as string;

const headerHeight = useHeaderHeight();
const insets = useSafeAreaInsets();

const [home, setHome] = React.useState<[PlayerForm, PlayerForm]>([
{ name: '', gender: 'U', handedness: 'R' },
{ name: '', gender: 'U', handedness: 'R' },
]);
const [away, setAway] = React.useState<[PlayerForm, PlayerForm]>([
{ name: '', gender: 'U', handedness: 'R' },
{ name: '', gender: 'U', handedness: 'R' },
]);
const [homeRight, setHomeRight] = React.useState<0 | 1>(0);
const [awayRight, setAwayRight] = React.useState<0 | 1>(0);
const [startingTeam, setStartingTeam] = React.useState<0 | 1>(0);
const [startingIndex, setStartingIndex] = React.useState<0 | 1>(0);

// 單打/雙打
const [isSingles, setIsSingles] = React.useState<boolean>(false);

React.useEffect(() => {
(async () => {
const m = await getMatch(matchId);
if (m) {
// 判斷單/雙打
const singles = m.type === 'MS' || m.type === 'WS';
setIsSingles(singles);

    if (typeof m.home_right_when_even_index === 'number') setHomeRight(m.home_right_when_even_index as 0 | 1);
    if (typeof m.away_right_when_even_index === 'number') setAwayRight(m.away_right_when_even_index as 0 | 1);
    if (typeof m.starting_server_team === 'number') setStartingTeam(m.starting_server_team as 0 | 1);
    if (typeof m.starting_server_index === 'number') setStartingIndex(m.starting_server_index as 0 | 1);
  }
  const ps = await getMatchPlayers(matchId);
  if (ps && ps.length) {
    const h: [PlayerForm, PlayerForm] = [
      { name: '', gender: 'U', handedness: 'R' },
      { name: '', gender: 'U', handedness: 'R' },
    ];
    const a: [PlayerForm, PlayerForm] = [
      { name: '', gender: 'U', handedness: 'R' },
      { name: '', gender: 'U', handedness: 'R' },
    ];
    for (const p of ps) {
      const form: PlayerForm = {
        name: p.name || '',
        gender: (p.gender as any) || 'U',
        handedness: (p.handedness as any) || 'R',
      };
      if (p.side === 'home') h[p.idx] = form;
      else a[p.idx] = form;
    }
    setHome(h);
    setAway(a);
  }
})();
}, [matchId]);

const save = async () => {
try {
// 單打模式：強制開場發球人員 index 為 0（只有 #1）
const sIndex = isSingles ? 0 : startingIndex;

  await upsertMatchPlayers({
    matchId,
    home: [
      { idx: 0, name: home[0].name, gender: home[0].gender, handedness: home[0].handedness },
      { idx: 1, name: isSingles ? '' : home[1].name, gender: isSingles ? 'U' : home[1].gender, handedness: isSingles ? 'R' : home[1].handedness },
    ],
    away: [
      { idx: 0, name: away[0].name, gender: away[0].gender, handedness: away[0].handedness },
      { idx: 1, name: isSingles ? '' : away[1].name, gender: isSingles ? 'U' : away[1].gender, handedness: isSingles ? 'R' : away[1].handedness },
    ],
  });

  await updateStartConfigs({
    matchId,
    startingServerTeam: startingTeam,
    startingServerIndex: sIndex,
    // 單打時此選項不顯示，但資料仍可保留（不影響單打邏輯）
    homeRightWhenEven: homeRight,
    awayRightWhenEven: awayRight,
  });

  Alert.alert('已儲存', '球員與起始設定已更新');
  navigation.goBack();
} catch (e: any) {
  Alert.alert('儲存失敗', String(e?.message || e));
}
};

// ---- 避免鍵盤遮住輸入：只在需要時捲動 ----
const scrollRef = React.useRef<ScrollView | null>(null);
const inputRectsRef = React.useRef<Record<string, { y: number; h: number }>>({});
const viewportHRef = React.useRef(0);
const scrollYRef = React.useRef(0);

const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
scrollYRef.current = e.nativeEvent.contentOffset.y;
};
const onScrollViewLayout = (e: LayoutChangeEvent) => {
viewportHRef.current = e.nativeEvent.layout.height;
};

const onInputLayout = (key: string) => (e: LayoutChangeEvent) => {
const { y, height } = e.nativeEvent.layout;
inputRectsRef.current[key] = { y, h: height };
};

const onInputFocus = (key: string) => () => {
const rect = inputRectsRef.current[key];
if (!rect) return;
const margin = 80; // 讓欄位上方留一些空白
const top = rect.y;
const bottom = rect.y + rect.h;

const visibleTop = scrollYRef.current;
const visibleBottom = scrollYRef.current + viewportHRef.current;

// 已可見就不捲
if (top >= visibleTop + 8 && bottom <= visibleBottom - 8) return;

if (top < visibleTop + margin) {
  const to = Math.max(0, top - margin);
  scrollRef.current?.scrollTo({ y: to, animated: true });
  return;
}
if (bottom > visibleBottom - margin) {
  const to = Math.max(0, bottom - viewportHRef.current + margin);
  scrollRef.current?.scrollTo({ y: to, animated: true });
}
};
// ------------------------------------------------

return (
<KeyboardAvoidingView
style={{ flex: 1 }}
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
keyboardVerticalOffset={headerHeight}
>
<ScrollView
ref={scrollRef}
onLayout={onScrollViewLayout}
onScroll={onScroll}
scrollEventThrottle={16}
contentContainerStyle={{ padding: 16, paddingBottom: (insets.bottom || 16) + 320 }}
keyboardShouldPersistTaps="handled"
style={{ flex: 1, backgroundColor: C.bg }}
>
<Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: C.text }}>球員設定</Text>

    <TeamBox
      title="主隊（Home）"
      players={home}
      onChange={(p) => setHome(p)}
      rightWhenEven={homeRight}
      setRightWhenEven={setHomeRight}
      nameKeys={['home-0', 'home-1']}
      onNameLayout={onInputLayout}
      onNameFocus={onInputFocus}
      singles={isSingles}
    />
    <TeamBox
      title="客隊（Away）"
      players={away}
      onChange={(p) => setAway(p)}
      rightWhenEven={awayRight}
      setRightWhenEven={setAwayRight}
      nameKeys={['away-0', 'away-1']}
      onNameLayout={onInputLayout}
      onNameFocus={onInputFocus}
      singles={isSingles}
    />

    <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8, color: C.text }}>開場發球</Text>
    <Row>
      <Badge onPress={() => setStartingTeam(0)} active={startingTeam === 0} text="主隊" />
      <Badge onPress={() => setStartingTeam(1)} active={startingTeam === 1} text="客隊" />
    </Row>

    {/* 單打不顯示 #1/#2 選擇 */}
    {!isSingles && (
      <Row>
        <Badge onPress={() => setStartingIndex(0)} active={startingIndex === 0} text="#1" />
        <Badge onPress={() => setStartingIndex(1)} active={startingIndex === 1} text="#2" />
      </Row>
    )}

    <Pressable
      onPress={save}
      style={{ marginTop: 20, backgroundColor: '#1976d2', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
    >
      <Text style={{ color: '#fff', fontSize: 16 }}>儲存</Text>
    </Pressable>
  </ScrollView>
</KeyboardAvoidingView>
);
}

function TeamBox({
title,
players,
onChange,
rightWhenEven,
setRightWhenEven,
nameKeys,
onNameLayout,
onNameFocus,
singles = false,
}: {
title: string;
players: [PlayerForm, PlayerForm];
onChange: (v: [PlayerForm, PlayerForm]) => void;
rightWhenEven: 0 | 1;
setRightWhenEven: (v: 0 | 1) => void;
nameKeys: [string, string];
onNameLayout: (key: string) => (e: LayoutChangeEvent) => void;
onNameFocus: (key: string) => () => void;
singles?: boolean;
}) {
const setP = (i: 0 | 1, patch: Partial<PlayerForm>) => {
const next: [PlayerForm, PlayerForm] = [...players] as any;
next[i] = { ...next[i], ...patch };
onChange(next);
};

// 單打只顯示 #1
const idxList: Array<0 | 1> = singles ? [0] : [0, 1];

return (
<View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 12 }}>
<Text style={{ fontWeight: '600', marginBottom: 8, color: C.text }}>{title}</Text>

  {idxList.map((i) => (
    <View key={i} style={{ marginBottom: 10 }}>
      <Text style={{ marginBottom: 6, color: C.sub }}>球員 #{i + 1}</Text>
      <TextInput
        placeholder="姓名"
        placeholderTextColor={C.hint}
        value={players[i].name}
        onChangeText={(t) => setP(i, { name: t })}
        onLayout={onNameLayout(nameKeys[i])}
        onFocus={onNameFocus(nameKeys[i])}
        style={{
          borderWidth: 1,
          borderColor: C.fieldBorder,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 6,
          backgroundColor: C.field,
          color: C.text,
        }}
        returnKeyType="done"
      />
      <Row>
        <Badge onPress={() => setP(i, { gender: 'M' })} active={players[i].gender === 'M'} text="男" />
        <Badge onPress={() => setP(i, { gender: 'F' })} active={players[i].gender === 'F'} text="女" />
        <Badge onPress={() => setP(i, { gender: 'U' })} active={players[i].gender === 'U'} text="未註明" />
      </Row>
      <Row>
        <Badge onPress={() => setP(i, { handedness: 'R' })} active={players[i].handedness === 'R'} text="右手" />
        <Badge onPress={() => setP(i, { handedness: 'L' })} active={players[i].handedness === 'L'} text="左手" />
        <Badge onPress={() => setP(i, { handedness: 'U' })} active={players[i].handedness === 'U'} text="未註明" />
      </Row>
    </View>
  ))}

  {/* 單打不顯示「偶數分站右」選擇 */}
  {!singles && (
    <>
      <Text style={{ marginTop: 4, marginBottom: 6, color: C.sub }}>偶數分站右（Right when Even）：</Text>
      <Row>
        <Badge onPress={() => setRightWhenEven(0)} active={rightWhenEven === 0} text="#1 在右" />
        <Badge onPress={() => setRightWhenEven(1)} active={rightWhenEven === 1} text="#2 在右" />
      </Row>
    </>
  )}
</View>
);
}

function Row({ children }: any) {
return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>{children}</View>;
}
function Badge({ text, active, onPress }: { text: string; active?: boolean; onPress?: () => void }) {
return (
<Pressable
onPress={onPress}
style={{
paddingVertical: 8,
paddingHorizontal: 12,
borderRadius: 16,
borderWidth: 1,
borderColor: active ? C.chipOn : C.chipOff,
backgroundColor: active ? 'rgba(144,202,249,0.15)' : C.card,
marginRight: 8,
marginBottom: 8,
}}>
<Text style={{ color: C.text }}>{text}</Text>
</Pressable>
);
}