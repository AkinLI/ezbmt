import React from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getMatch, getMatchPlayers, upsertMatchPlayers, updateStartConfigs } from '../db';

type PlayerForm = { name: string; gender: 'M' | 'F' | 'U'; handedness: 'L' | 'R' | 'U' };

export default function PlayerSetupScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const matchId = route.params.matchId as string;

  const [home, setHome] = React.useState<[PlayerForm, PlayerForm]>([
    { name: '', gender: 'U', handedness: 'R' },
    { name: '', gender: 'U', handedness: 'R' },
  ]);
  const [away, setAway] = React.useState<[PlayerForm, PlayerForm]>([
    { name: '', gender: 'U', handedness: 'R' },
    { name: '', gender: 'U', handedness: 'R' },
  ]);
  const [homeRight, setHomeRight] = React.useState<0 | 1>(0); // 偶數分站右
  const [awayRight, setAwayRight] = React.useState<0 | 1>(0);
  const [startingTeam, setStartingTeam] = React.useState<0 | 1>(0);
  const [startingIndex, setStartingIndex] = React.useState<0 | 1>(0);

  React.useEffect(() => {
    (async () => {
      const m = await getMatch(matchId);
      if (m) {
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
      await upsertMatchPlayers({
        matchId,
        home: [
          { idx: 0, name: home[0].name, gender: home[0].gender, handedness: home[0].handedness },
          { idx: 1, name: home[1].name, gender: home[1].gender, handedness: home[1].handedness },
        ],
        away: [
          { idx: 0, name: away[0].name, gender: away[0].gender, handedness: away[0].handedness },
          { idx: 1, name: away[1].name, gender: away[1].gender, handedness: away[1].handedness },
        ],
      });
      await updateStartConfigs({
        matchId,
        startingServerTeam: startingTeam,
        startingServerIndex: startingIndex,
        homeRightWhenEven: homeRight,
        awayRightWhenEven: awayRight,
      });
      Alert.alert('已儲存', '球員與起始設定已更新');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('儲存失敗', String(e?.message || e));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>球員設定</Text>

      <TeamBox
        title="主隊（Home）"
        players={home}
        onChange={(p) => setHome(p)}
        rightWhenEven={homeRight}
        setRightWhenEven={setHomeRight}
      />
      <TeamBox
        title="客隊（Away）"
        players={away}
        onChange={(p) => setAway(p)}
        rightWhenEven={awayRight}
        setRightWhenEven={setAwayRight}
      />

      <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>開場發球</Text>
      <Row>
        <Badge onPress={() => setStartingTeam(0)} active={startingTeam === 0} text="主隊" />
        <Badge onPress={() => setStartingTeam(1)} active={startingTeam === 1} text="客隊" />
      </Row>
      <Row>
        <Badge onPress={() => setStartingIndex(0)} active={startingIndex === 0} text="#1" />
        <Badge onPress={() => setStartingIndex(1)} active={startingIndex === 1} text="#2" />
      </Row>

      <Pressable onPress={save} style={{ marginTop: 20, backgroundColor: '#1976d2', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 16 }}>儲存</Text>
      </Pressable>
    </ScrollView>
  );
}

function TeamBox({
  title, players, onChange, rightWhenEven, setRightWhenEven,
}: {
  title: string;
  players: [PlayerForm, PlayerForm];
  onChange: (v: [PlayerForm, PlayerForm]) => void;
  rightWhenEven: 0 | 1;
  setRightWhenEven: (v: 0 | 1) => void;
}) {
  const setP = (i: 0 | 1, patch: Partial<PlayerForm>) => {
    const next: [PlayerForm, PlayerForm] = [...players] as any;
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Text style={{ fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      {[0, 1].map((i) => (
        <View key={i} style={{ marginBottom: 10 }}>
          <Text style={{ marginBottom: 6 }}>球員 #{i + 1}</Text>
          <TextInput
            placeholder="姓名"
            value={players[i].name}
            onChangeText={(t) => setP(i as 0 | 1, { name: t })}
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 }}
          />
          <Row>
            <Badge onPress={() => setP(i as 0 | 1, { gender: 'M' })} active={players[i].gender === 'M'} text="男" />
            <Badge onPress={() => setP(i as 0 | 1, { gender: 'F' })} active={players[i].gender === 'F'} text="女" />
            <Badge onPress={() => setP(i as 0 | 1, { gender: 'U' })} active={players[i].gender === 'U'} text="未註明" />
          </Row>
          <Row>
            <Badge onPress={() => setP(i as 0 | 1, { handedness: 'R' })} active={players[i].handedness === 'R'} text="右手" />
            <Badge onPress={() => setP(i as 0 | 1, { handedness: 'L' })} active={players[i].handedness === 'L'} text="左手" />
            <Badge onPress={() => setP(i as 0 | 1, { handedness: 'U' })} active={players[i].handedness === 'U'} text="未註明" />
          </Row>
        </View>
      ))}

      <Text style={{ marginTop: 4, marginBottom: 6 }}>偶數分站右（Right when Even）：</Text>
      <Row>
        <Badge onPress={() => setRightWhenEven(0)} active={rightWhenEven === 0} text="#1 在右" />
        <Badge onPress={() => setRightWhenEven(1)} active={rightWhenEven === 1} text="#2 在右" />
      </Row>
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
        borderColor: active ? '#1976d2' : '#ccc',
        backgroundColor: active ? 'rgba(25,118,210,0.1)' : '#fff',
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: '#333' }}>{text}</Text>
    </Pressable>
  );
}
