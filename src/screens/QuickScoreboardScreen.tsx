import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput as RNTextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWindowDimensions } from 'react-native';
import { createMatch, nextRally, getUiSnapshot, type MatchState } from '../logic/serve';
import { listClubs, getMyClubRoles, listBuddies } from '../db';

const STORE_KEY = 'quick-scoreboard:prefs:v3';

const C = {
  bg: '#111',
  card: '#1e1e1e',
  text: '#fff',
  sub: '#bbb',
  border: '#333',
  red: '#c62828',
  teal: '#00838f',
  chip: '#90caf9',
  btn: '#1976d2',
  gray: '#616161',
};

type PlayerForm = { name: string };
type Rules = { bestOf: 1 | 3; pointsToWin: 11 | 15 | 21 | 25 | 31; deuce: boolean };
type Config = {
  singles: boolean;
  home: [PlayerForm, PlayerForm];
  away: [PlayerForm, PlayerForm];
  homeRight: 0 | 1;
  awayRight: 0 | 1;
  startingTeam: 0 | 1;
  startingIndex: 0 | 1;
  rules: Rules;
};

const DEFAULT_CFG: Config = {
  singles: false,
  home: [{ name: '' }, { name: '' }],
  away: [{ name: '' }, { name: '' }],
  homeRight: 0,
  awayRight: 0,
  startingTeam: 0,
  startingIndex: 0,
  rules: { bestOf: 1, pointsToWin: 25, deuce: true },
};

export default function QuickScoreboardScreen() {
  // hooks 一律放頂端
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;

  const [mode, setMode] = React.useState<'setup' | 'board'>('setup');
  const [cfg, setCfg] = React.useState<Config>(DEFAULT_CFG);
  const [loading, setLoading] = React.useState(true);

  // 球友名單（彙整我為 owner 的社團）
  const [buddies, setBuddies] = React.useState<Array<{ id: string; name: string }>>([]);
  const [picker, setPicker] = React.useState<{
    open: boolean;
    target?: 'home0' | 'home1' | 'away0' | 'away1';
    q: string;
  }>({ open: false, q: '' });

  // 計分狀態
  const [state, setState] = React.useState<MatchState | null>(null);
  const [snap, setSnap] = React.useState<any>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(STORE_KEY);
        if (s) {
          try {
            setCfg({ ...DEFAULT_CFG, ...(JSON.parse(s) as any) });
          } catch {}
        }
        await loadMyBuddies();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadMyBuddies() {
    try {
      const clubs = (await listClubs()) as Array<{ id: string }>;
      const out: Array<{ id: string; name: string }> = [];

      for (const c of clubs) {
        try {
          const roles = await getMyClubRoles([c.id]);
          const myRole = roles[c.id] || '';
          if (myRole === 'owner') {
            const rows = (await listBuddies(c.id)) as Array<{ id: string; name?: string | null }>;
            rows.forEach((b: { id: string; name?: string | null }) => {
              out.push({ id: b.id, name: (b.name ?? '') });
            });
          }
        } catch {}
      }

      // 以名字去重
      const map = new Map<string, string>();
      out.forEach((b: { id: string; name: string }) => {
        if (b.name) map.set(b.name, b.id);
      });
      setBuddies(Array.from(map.entries()).map(([name, id]) => ({ id, name })));
    } catch {}
  }

  function setPlayer(team: 'home' | 'away', idx: 0 | 1, name: string) {
    setCfg(prev => {
      const next = { ...prev, [team]: [...(prev as any)[team]] } as Config;
      (next as any)[team][idx] = { name };
      return next;
    });
  }
  function openPick(team: 'home' | 'away', idx: 0 | 1) {
    setPicker({ open: true, target: `${team}${idx}` as any, q: '' });
  }
  function applyPick(name: string) {
    if (!picker.target) {
      setPicker({ open: false, q: '' });
      return;
    }
    const t = picker.target as 'home0' | 'home1' | 'away0' | 'away1';
    const team = t.startsWith('home') ? 'home' : 'away';
    const idx = (t.endsWith('0') ? 0 : 1) as 0 | 1;
    setPlayer(team as any, idx, name);
    setPicker({ open: false, q: '' });
  }

  function startBoard() {
    try {
      const homePlayers: [any, any] = [
        { id: 'A0', name: cfg.home[0].name || '主#1' },
        { id: 'A1', name: cfg.singles ? '' : (cfg.home[1].name || '主#2') },
      ];
      const awayPlayers: [any, any] = [
        { id: 'B0', name: cfg.away[0].name || '客#1' },
        { id: 'B1', name: cfg.singles ? '' : (cfg.away[1].name || '客#2') },
      ];
      const rules = {
        bestOf: cfg.rules.bestOf,
        pointsToWin: cfg.rules.pointsToWin,
        winBy: cfg.rules.deuce ? 2 : 1,
        cap: cfg.rules.pointsToWin === 21 ? 30 : null,
        technicalTimeoutAt: null,
        changeEndsInDeciderAt: null,
      } as any;

      const s = createMatch({
        teams: [
          { players: homePlayers, startRightIndex: cfg.homeRight },
          { players: awayPlayers, startRightIndex: cfg.awayRight },
        ],
        rules,
        startingServerTeam: cfg.startingTeam,
        startingServerPlayerIndex: cfg.startingIndex,
        metadata: { category: cfg.singles ? 'MD' : 'MD' },
      });
      setState(s);
      setSnap(getUiSnapshot(s));
      setMode('board');
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(cfg)).catch(() => {});
    } catch (e: any) {
      Alert.alert('開始失敗', String(e?.message || e));
    }
  }

      function score(team: 0 | 1) {
    if (!state) return;
    const next = nextRally({ ...state }, team);
    setState(next);
    setSnap(getUiSnapshot(next));
  }
  
  // 字級：依最短邊自動縮放；分數儘量大
  const shortSide = Math.min(width, height);
  const bigFont = Math.max(52, Math.floor(shortSide * 0.50)); // 放大到 30%
  const nameFont = Math.max(16, Math.floor(shortSide * 0.06));

  // 顯示名字
  const homeNames = [cfg.home[0].name || '主#1', cfg.singles ? '' : (cfg.home[1].name || '主#2')];
  const awayNames = [cfg.away[0].name || '客#1', cfg.singles ? '' : (cfg.away[1].name || '客#2')];

  // 站位/發接球
  const posA = snap?.positions?.teamA || { right: 0, left: 1 };
  const posB = snap?.positions?.teamB || { right: 0, left: 1 };
  const nameHomeR = homeNames[posA.right] || '';
  const nameHomeL = cfg.singles ? '' : (homeNames[posA.left] || '');
  const nameAwayR = awayNames[posB.right] || '';
  const nameAwayL = cfg.singles ? '' : (awayNames[posB.left] || '');

  const srvTeam = snap?.server?.team as 0 | 1 | undefined;
  const srvIdx = snap?.server?.index as 0 | 1 | undefined;
  const srvCourt = snap?.server?.court as 'R' | 'L' | undefined;
  const rcvTeam = snap?.receiver?.team as 0 | 1 | undefined;
  const rcvIdx = snap?.receiver?.index as 0 | 1 | undefined;
  const rcvCourt = snap?.receiver?.court as 'R' | 'L' | undefined;

  const isSrv = (t: 0 | 1, idx: 0 | 1) => srvTeam === t && srvIdx === idx;
  const isRcv = (t: 0 | 1, idx: 0 | 1) => rcvTeam === t && rcvIdx === idx;

  // ================== 板面（不改手機方向；直式時把容器旋轉 90°） ==================
  if (mode === 'board') {
    const scoreA = snap?.scoreA ?? 0;
    const scoreB = snap?.scoreB ?? 0;

    const rotateStyle = isPortrait
      ? { width: height, height: width, transform: [{ rotate: '90deg' }] }
      : { width, height, transform: [{ rotate: '0deg' }] };

    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[{ backgroundColor: C.bg }, rotateStyle]}>
          {/* 上方列：規則 + 發/接訊息 */}
          <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6 }}>
            <Text style={{ color: C.sub }}>
              {`規則：${cfg.rules.bestOf} 局 · 到 ${cfg.rules.pointsToWin} 分 · ${cfg.rules.deuce ? 'Deuce開' : 'Deuce關'}  ｜  `}
              {`發：${
                srvTeam === 0
                  ? homeNames[srvIdx ?? 0]
                  : srvTeam === 1
                  ? awayNames[srvIdx ?? 0]
                  : '-'
              }（${srvCourt || '-'}）  `}
              {`接：${
                rcvTeam === 0
                  ? homeNames[rcvIdx ?? 0]
                  : rcvTeam === 1
                  ? awayNames[rcvIdx ?? 0]
                  : '-'
              }（${rcvCourt || '-'}）`}
            </Text>
          </View>

          <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* 左：主隊 */}
            <Pressable
              style={{ flex: 1, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => score(0)}
            >
              <Text style={{ color: '#fff', fontSize: bigFont, fontWeight: '900' }}>
                {String(scoreA).padStart(2, '0')}
              </Text>

              {/* 主隊站位（右/左） */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: '88%', // 置中且縮進，避免貼邊裁切
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Seat
                    label="右"
                    name={nameHomeR}
                    highlightSrv={isSrv(0, posA.right)}
                    highlightRcv={isRcv(0, posA.right)}
                    style={{ flexBasis: '48%', maxWidth: '48%' }}
                  />
                  {!cfg.singles && (
                    <Seat
                      label="左"
                      name={nameHomeL}
                      highlightSrv={isSrv(0, posA.left)}
                      highlightRcv={isRcv(0, posA.left)}
                      style={{ flexBasis: '48%', maxWidth: '48%' }}
                    />
                  )}
                </View>
              </View>
            </Pressable>

            {/* 右：客隊 */}
            <Pressable
              style={{ flex: 1, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => score(1)}
            >
              <Text style={{ color: '#fff', fontSize: bigFont, fontWeight: '900' }}>
                {String(scoreB).padStart(2, '0')}
              </Text>

              {/* 客隊站位（右/左） */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: '88%',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Seat
                    label="右"
                    name={nameAwayR}
                    highlightSrv={isSrv(1, posB.right)}
                    highlightRcv={isRcv(1, posB.right)}
                    style={{ flexBasis: '48%', maxWidth: '48%' }}
                  />
                  {!cfg.singles && (
                    <Seat
                      label="左"
                      name={nameAwayL}
                      highlightSrv={isSrv(1, posB.left)}
                      highlightRcv={isRcv(1, posB.left)}
                      style={{ flexBasis: '48%', maxWidth: '48%' }}
                    />
                  )}
                </View>
              </View>
            </Pressable>
          </View>

          {/* 返回設定 */}
          <View style={{ position: 'absolute', right: 90, top: 5 }}>
            <Pressable
              onPress={() => setMode('setup')}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#eee',
                backgroundColor: 'rgba(0,0,0,0.25)',
              }}
            >
              <Text style={{ color: '#fff' }}>設定</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ================== 設定模式 ==================
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 12 }}>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>快速計分板（本機）</Text>

      <Card title="規則">
        <Row label="局數">
          <Chip text="1 局" active={cfg.rules.bestOf === 1} onPress={() => setCfg(p => ({ ...p, rules: { ...p.rules, bestOf: 1 } }))} />
          <Chip text="3 局" active={cfg.rules.bestOf === 3} onPress={() => setCfg(p => ({ ...p, rules: { ...p.rules, bestOf: 3 } }))} />
        </Row>
        <Row label="分數">
          {[11, 15, 21, 25, 31].map(p => (
            <Chip
              key={p}
              text={`${p}`}
              active={cfg.rules.pointsToWin === p}
              onPress={() => setCfg(s => ({ ...s, rules: { ...s.rules, pointsToWin: p as any } }))}
            />
          ))}
        </Row>
        <Row label="Deuce">
          <Chip
            text={cfg.rules.deuce ? '開' : '關'}
            active={cfg.rules.deuce}
            onPress={() => setCfg(s => ({ ...s, rules: { ...s.rules, deuce: !s.rules.deuce } }))}
          />
        </Row>
      </Card>

      <Card title="模式與起始">
        <Row label="模式">
          <Chip text="雙打" active={!cfg.singles} onPress={() => setCfg(p => ({ ...p, singles: false }))} />
          <Chip text="單打" active={cfg.singles} onPress={() => setCfg(p => ({ ...p, singles: true }))} />
        </Row>
        <Row label="主隊偶數右">
          <Chip text="#1 在右" active={cfg.homeRight === 0} onPress={() => setCfg(p => ({ ...p, homeRight: 0 }))} />
          <Chip text="#2 在右" active={cfg.homeRight === 1} onPress={() => setCfg(p => ({ ...p, homeRight: 1 }))} />
        </Row>
        <Row label="客隊偶數右">
          <Chip text="#1 在右" active={cfg.awayRight === 0} onPress={() => setCfg(p => ({ ...p, awayRight: 0 }))} />
          <Chip text="#2 在右" active={cfg.awayRight === 1} onPress={() => setCfg(p => ({ ...p, awayRight: 1 }))} />
        </Row>
        <Row label="開局發球">
          <Chip text="主隊" active={cfg.startingTeam === 0} onPress={() => setCfg(p => ({ ...p, startingTeam: 0 }))} />
          <Chip text="客隊" active={cfg.startingTeam === 1} onPress={() => setCfg(p => ({ ...p, startingTeam: 1 }))} />
        </Row>
        {!cfg.singles && (
          <Row label="發球人">
            <Chip text="#1" active={cfg.startingIndex === 0} onPress={() => setCfg(p => ({ ...p, startingIndex: 0 }))} />
            <Chip text="#2" active={cfg.startingIndex === 1} onPress={() => setCfg(p => ({ ...p, startingIndex: 1 }))} />
          </Row>
        )}
      </Card>

      <Card title="球員（可從球友帶入）">
        <Text style={{ color: '#90caf9', marginBottom: 4 }}>主隊</Text>
        <PlayerInput label="#1" value={cfg.home[0].name} onChange={(v: string) => setPlayer('home', 0, v)} onPick={() => openPick('home', 0)} />
        {!cfg.singles && (
          <PlayerInput label="#2" value={cfg.home[1].name} onChange={(v: string) => setPlayer('home', 1, v)} onPick={() => openPick('home', 1)} />
        )}

        <Text style={{ color: '#ef9a9a', marginTop: 12, marginBottom: 4 }}>客隊</Text>
        <PlayerInput label="#1" value={cfg.away[0].name} onChange={(v: string) => setPlayer('away', 0, v)} onPick={() => openPick('away', 0)} />
        {!cfg.singles && (
          <PlayerInput label="#2" value={cfg.away[1].name} onChange={(v: string) => setPlayer('away', 1, v)} onPick={() => openPick('away', 1)} />
        )}
      </Card>

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <Pressable
          onPress={startBoard}
          style={{ flex: 1, backgroundColor: '#2e7d32', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginRight: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>開始</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setCfg(DEFAULT_CFG);
            AsyncStorage.removeItem(STORE_KEY).catch(() => {});
          }}
          style={{ width: 120, backgroundColor: C.gray, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff' }}>重置</Text>
        </Pressable>
      </View>

      {/* 球友挑選 */}
      <Modal visible={picker.open} transparent animationType="slide" onRequestClose={() => setPicker({ open: false, q: '' })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12, maxHeight: '70%' }}>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 8 }}>從球友帶入</Text>
            <RNTextInput
              value={picker.q}
              onChangeText={(t: string) => setPicker(p => ({ ...p, q: t }))}
              placeholder="搜尋球友"
              placeholderTextColor="#888"
              style={{
                borderWidth: 1,
                borderColor: '#444',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                color: '#fff',
                backgroundColor: '#111',
                marginBottom: 8,
              }}
            />
            <FlatList
              data={buddies.filter(b => (picker.q ? b.name.toLowerCase().includes(picker.q.toLowerCase()) : true))}
              keyExtractor={(i: { id: string }) => i.id}
              renderItem={({ item }: { item: { id: string; name: string } }) => (
                <Pressable onPress={() => applyPick(item.name)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#333' }}>
                  <Text style={{ color: '#fff' }}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={{ color: '#888', paddingVertical: 8 }}>
                  尚未找到球友（需在某社團為 owner 並在該社團建立球友名單）
                </Text>
              }
              style={{ maxHeight: '70%' }}
            />
            <Pressable onPress={() => setPicker({ open: false, q: '' })} style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ color: '#90caf9' }}>關閉</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// -------------------- 小組件 --------------------
function Card({ title, children }: { title: string; children: any }) {
  return (
    <View style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
      <Text style={{ color: C.text, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, children }: { label: string; children: any }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: '#bbb', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>
    </View>
  );
}
function Chip({ text, active, onPress }: { text: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? C.chip : '#555',
        backgroundColor: active ? 'rgba(144,202,249,0.15)' : C.card,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: '#fff' }}>{text}</Text>
    </Pressable>
  );
}
function PlayerInput({ label, value, onChange, onPick }: { label: string; value: string; onChange: (s: string) => void; onPick: () => void }) {
  return (
    <View style={{ marginBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ color: '#bbb', width: 28 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="球員名字"
        placeholderTextColor="#888"
        style={{ flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', backgroundColor: '#111' }}
      />
      <Pressable onPress={onPick} style={{ marginLeft: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#555' }}>
        <Text style={{ color: '#90caf9' }}>帶入</Text>
      </Pressable>
    </View>
  );
}
function Seat({
  label,
  name,
  highlightSrv,
  highlightRcv,
  style,
}: {
  label: '右' | '左';
  name: string;
  highlightSrv?: boolean;
  highlightRcv?: boolean;
  style?: any;
}) {
  const ring = highlightSrv ? '#ffd54f' : highlightRcv ? '#80deea' : '#ddd';
  return (
    <View
      style={[
        {
          minWidth: 120,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: ring,
          backgroundColor: 'rgba(0,0,0,0.25)',
          // 關鍵：容器可縮、可裁、置中
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          overflow: 'hidden',
        },
        style, // 接收外部的 flexBasis/maxWidth
      ]}
    >
      <Text
        style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}
        numberOfLines={1}
        ellipsizeMode="clip"
      >
        {`${label}：${name || '-'}`}
      </Text>
      <Text
        style={{ color: ring, marginTop: 2, fontSize: 12, textAlign: 'center' }}
        numberOfLines={1}
        ellipsizeMode="clip"
      >
        {highlightSrv ? '發球位' : highlightRcv ? '接球位' : ' '}
      </Text>
    </View>
  );
}