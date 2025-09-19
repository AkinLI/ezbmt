import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import Svg, { Line, Path, Text as SvgText, G } from 'react-native-svg';
import { getMatch, getMatchPlayers, listRalliesOrdered } from '../db';
import { deserialize, getUiSnapshot } from '../logic/serve';
import { subscribeLive, LiveSnapshot } from '../lib/supabase';

type SeriesByGame = Array<{ game: number; rows: Array<{ win: boolean }> }>;

function TrendChart({ title, rows }: { title: string; rows: Array<{ win: boolean }> }) {
  const [w, setW] = React.useState(0);
  const H = 160;
  const PAD = 28;

  const series = React.useMemo(() => {
    const home: number[] = [0];
    const away: number[] = [0];
    let h = 0, a = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].win) h++; else a++;
      home.push(h); away.push(a);
    }
    const maxY = Math.max(1, h, a);
    return { home, away, maxY };
  }, [rows]);

  const ticks = React.useMemo(() => {
    const arr: number[] = [];
    for (let v = 0; v <= series.maxY; v += 5) arr.push(v);
    if (arr[arr.length - 1] !== series.maxY) arr.push(series.maxY);
    return arr;
  }, [series.maxY]);

  const yOf = (v: number) => {
    const plotH = Math.max(1, H - PAD * 2);
    return PAD + (plotH * (1 - v / series.maxY));
  };

  const buildPath = (vals: number[], W: number, H: number, maxY: number) => {
    const plotW = Math.max(1, W - PAD * 2);
    const plotH = Math.max(1, H - PAD * 2);
    const n = vals.length; if (n <= 1) return '';
    const stepX = plotW / (n - 1);
    const yOf2 = (v: number) => PAD + (plotH * (1 - v / maxY));
    let d = `M ${PAD} ${yOf2(vals[0])}`;
    for (let i = 1; i < n; i++) {
      const x = PAD + i * stepX;
      const y = yOf2(vals[i]);
      d +=  `L ${x} ${y}`;
    }
    return d;
  };

  return (
    <View
      onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))}
      style={{ marginTop: 10, padding: 10, borderWidth: 1, borderColor: '#333', borderRadius: 10, backgroundColor: '#222' }}
    >
      <Text style={{ color: '#fff', fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      {w <= 0 ? null : (
        <Svg width={w} height={H}>
          {/* 軸線 */}
          <G>
            <Line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#444" strokeWidth={1} />
            <Line x1={PAD} y1={H - PAD} x2={w - PAD} y2={H - PAD} stroke="#444" strokeWidth={1} />
          </G>
          {/* 每 5 分 + 最後分數，滿版水平線 + 數字 */}
          <G>
            {ticks.map(v => {
              const y = yOf(v);
              return (
                <G key={'yt-'+v}>
                  <Line x1={PAD} y1={y} x2={w - PAD} y2={y} stroke="#3a3a3a" strokeWidth={1} opacity={v===0?0.55:0.28}/>
                  <SvgText x={PAD - 6} y={y + 4} fill="#888" fontSize={10} textAnchor="end">{v}</SvgText>
                </G>
              );
            })}
          </G>
          {/* 折線 */}
          <Path d={buildPath(series.home, w, H, series.maxY)} stroke="#1976d2" strokeWidth={2} fill="none" />
          <Path d={buildPath(series.away, w, H, series.maxY)} stroke="#d32f2f" strokeWidth={2} fill="none" />
        </Svg>
      )}
    </View>
  );
}

export default function LiveScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const matchId = route.params?.matchId as string | undefined;

  const [ui, setUi] = React.useState<LiveSnapshot | null>(null);
  const [meta, setMeta] = React.useState<{ type?: string; court?: string | null; singles?: boolean }>({});
  const [players, setPlayers] = React.useState<{ home: [string|null, string|null]; away: [string|null, string|null] }>({ home: [null, null], away: [null, null] });
  const [series, setSeries] = React.useState<SeriesByGame>([]);
  const [eventId, setEventId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!matchId) return;

    let unsub: any = null;
    // Realtime（若未啟用則無動作）
    try {
      const sub = subscribeLive(matchId, (snap: LiveSnapshot) => setUi(snap));
      unsub = sub;
    } catch (_e) {}

    // Poll fallback
    let active = true;
    const fetchState = async () => {
      try {
        if (ui) return;
        const m = await getMatch(matchId);
        if (!active) return;
        if (m && m.state_json) {
          const s = deserialize(m.state_json);
          setUi(getUiSnapshot(s) as unknown as LiveSnapshot);
        }
      } catch {}
    };
    fetchState();
    const t = setInterval(fetchState, 1500);

    // 基本資料（類型/場地/球員/eventId）
    (async () => {
      try {
        const m = await getMatch(matchId);
        setEventId(m?.event_id || null);

        const type = String(m?.type || '');
        const singles = type.endsWith('S');
        setMeta({ type, court: (m?.court_no ?? null), singles });

        const rows = await getMatchPlayers(matchId);
        const home:[string|null,string|null] = [null,null];
        const away:[string|null,string|null] = [null,null];
        (rows||[]).forEach((r:any)=> {
          const nm = r?.name || null;
          if (r.side==='home') home[r.idx] = nm;
          else if (r.side==='away') away[r.idx] = nm;
        });
        setPlayers({ home, away });
      } catch {}
    })();

    // 每局趨勢資料（每 3 秒）
    const refreshSeries = async () => {
      try {
        const rows = await listRalliesOrdered(matchId);
        const byGame = new Map<number, Array<{win:boolean}>>();
        (rows||[]).forEach((r:any)=>{
          const g = Number(r.game_index||0);
          const win = r.winner_side === 'home';
          const arr = byGame.get(g) || [];
          arr.push({ win });
          byGame.set(g, arr);
        });
        const arr:SeriesByGame = Array.from(byGame.entries())
          .sort((a,b)=> b[0]-a[0]) // 最近的在最上
          .map(([g, rows])=>({ game: g, rows }));
        setSeries(arr);
      } catch {}
    };
    refreshSeries();
    const ts = setInterval(refreshSeries, 3000);

    return () => {
      active = false;
      clearInterval(t);
      clearInterval(ts);
      if (unsub && unsub.unsubscribe) unsub.unsubscribe();
    };
  }, [matchId]);

  if (!matchId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor:'#111' }}>
        <Text style={{ color:'#fff' }}>尚未提供 matchId，請從場次頁進入。</Text>
      </View>
    );
  }

  const scoreA = typeof ui?.scoreA === 'number' ? ui!.scoreA! : 0;
  const scoreB = typeof ui?.scoreB === 'number' ? ui!.scoreB! : 0;
  const server = ui?.server;
  const receiver = ui?.receiver;

  // 類型/場地/選手（發/接）
  const singles = !!meta.singles;
  const safe = (s: string|null|undefined, fallback: string) => (s && String(s).trim()) || fallback;
  const h0 = safe(players.home[0], '主#1');
  const h1 = safe(players.home[1], '主#2');
  const a0 = safe(players.away[0], '客#1');
  const a1 = safe(players.away[1], '客#2');

  const label = (team:0|1, idx:0|1, base:string) => {
    const tags:string[] = [];
    if (server && server.team===team && server.index===idx) tags.push('發');
    if (receiver && receiver.team===team && receiver.index===idx) tags.push('接');
    return tags.length ? `${base}（${tags.join('、')}）` : base;
  };

  const homeLine = singles
    ? `主隊：${label(0,0,h0)}`
    : `主隊：${label(0,0,h0)}、${label(0,1,h1)}`;

  const awayLine = singles
    ? `客隊：${label(1,0,a0)}`
    : `客隊：${label(1,0,a0)}、${label(1,1,a1)}`;

  // 卡片上的每局比分標籤（已含勝方）
  const gameBadges = React.useMemo(() => {
    if (!series.length) return null;
    const sums = series
      .map(sec => {
        const home = sec.rows.reduce((acc, r) => acc + (r.win ? 1 : 0), 0);
        const away = sec.rows.length - home;
        const winner = home > away ? 0 : away > home ? 1 : null;
        return { g: sec.game, home, away, winner };
      })
      .sort((a, b) => a.g - b.g);
    return (
      <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop:8 }}>
        {sums.map(x => (
          <View
            key={'badge-'+x.g}
            style={{ paddingVertical:4, paddingHorizontal:8, borderRadius:12, borderWidth:1, borderColor:'#333', backgroundColor:'#222', marginRight:6, marginBottom:6 }}
          >
            <Text style={{ color:'#fff' }}>
              G{x.g} {x.home}-{x.away}{x.winner==null ? '' : x.winner===0 ? '（主）' : '（客）'}
            </Text>
          </View>
        ))}
      </View>
    );
  }, [series]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#111' }} contentContainerStyle={{ padding: 16 }}>
      {/* 類型 / 場地 / 選手（含發/接 + 局分標籤 + 按鈕） */}
      <View style={{ backgroundColor:'#222', borderRadius:12, padding:12, marginBottom:12, borderWidth:1, borderColor:'#333' }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <Text style={{ color:'#fff', fontSize:16, fontWeight:'600' }}>
            類型：{meta.type || '-'}　場地：{meta.court || '-'}
          </Text>
          <View style={{ flexDirection:'row' }}>
            <Pressable
              onPress={() => navigation.navigate('Chat', { matchId })}
              style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#7b1fa2', borderRadius:8, marginRight:8 }}
            >
              <Text style={{ color:'#fff' }}>留言</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (eventId) navigation.navigate('Matches', { eventId }); }}
              style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#455a64', borderRadius:8 }}
            >
              <Text style={{ color:'#fff' }}>場次</Text>
            </Pressable>
          </View>
        </View>
        <Text style={{ color:'#ddd', marginTop:6 }}>{homeLine}</Text>
        <Text style={{ color:'#ddd', marginTop:4 }}>{awayLine}</Text>
        {gameBadges}
      </View>

      {/* 現在分數 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#222', borderRadius: 12 }}>
        <Text style={{ color: '#90caf9', fontSize: 48, fontWeight: '700' }}>{scoreA}</Text>
        <Text style={{ color: '#fff', fontSize: 32 }}>VS</Text>
        <Text style={{ color: '#ef9a9a', fontSize: 48, fontWeight: '700' }}>{scoreB}</Text>
      </View>

      {/* 每一局趨勢（標題加上勝方） */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color:'#fff', fontSize:16, fontWeight:'600', marginBottom:8 }}>每局趨勢</Text>
        {series.length === 0 ? (
          <Text style={{ color:'#999' }}>尚無記錄資料</Text>
        ) : (
          series.map(sec => {
            const homeWins = sec.rows.reduce((acc, r) => acc + (r.win ? 1 : 0), 0);
            const awayWins = sec.rows.length - homeWins;
            const winTag = homeWins > awayWins ? '（主勝）' : awayWins > homeWins ? '（客勝）' : '';
            return (
              <TrendChart
                key={'g'+sec.game}
                title={`第 ${sec.game} 局趨勢${winTag}`}
                rows={sec.rows}
              />
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
