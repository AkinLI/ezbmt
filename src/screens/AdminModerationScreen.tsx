import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supa } from '../lib/supabase';
import { publicUrlToPath, removeFile } from '../lib/storage';

const C = {
  bg: '#111',
  card: '#1e1e1e',
  border: '#333',
  text: '#fff',
  sub: '#bbb',
  btn: '#1976d2',
  warn: '#d32f2f',
  chip: '#90caf9',
};

type ChatRow = { id: string; user?: string | null; text: string; created_at: string; match_id?: string };
type ClubChatRow = { id: string; user?: string | null; text: string; created_at: string; club_id?: string };
type MediaRow = {
  id: string;
  owner_type: 'event' | 'match' | 'club' | string;
  owner_id: string;
  kind: 'youtube' | 'photo' | string;
  url: string;
  description?: string | null;
  created_at: string;
};
type ActiveUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  updated_at: string;
  lat?: number | null;
  lng?: number | null;
};

// 新增：總覽統計
type Overview = {
  users: number;
  clubs: number;
  events: number;
  sessions: number;
  media: number;
  activeUsers: number; // 10 分鐘內
};

// 新增：場次列表
type SessionLite = {
  id: string;
  date?: string | null;
  courts: number;
  round_minutes: number;
  rounds: number;
  last_round?: number | null;
  last_status?: string | null;
};

// 新增：全站 join requests（pending）
type JoinReqLite = {
  id: string;
  club_id: string;
  user_id: string;
  name?: string | null;
  email?: string | null;
  note?: string | null;
  created_at: string;
};

// 新增：全站 cams（online）
type CamLite = {
  device_id: string;
  owner_id: string;
  name?: string | null;
  platform?: string | null;
  last_seen_at?: string | null;
};

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const path = u.pathname.replace(/^\/+/, '');
      return path || null;
    }
    if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts)\/([A-Za-z0-9_-]{6,})/);
      if (m && m[2]) return m[2];
    }
  } catch {}
  return null;
}

function minutesAgo(mins: number): string {
  const d = new Date(Date.now() - mins * 60 * 1000);
  return d.toISOString();
}

export default function AdminModerationScreen() {
  const navigation = useNavigation<any>();

  const [admin, setAdmin] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<'overview' | 'chat' | 'club_chat' | 'media' | 'sessions' | 'cams' | 'join'>('overview');

  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  // 既有
  const [chats, setChats] = React.useState<ChatRow[]>([]);
  const [clubChats, setClubChats] = React.useState<ClubChatRow[]>([]);
  const [media, setMedia] = React.useState<MediaRow[]>([]);

  // 線上使用者 Sheet
  const [activeSheetOpen, setActiveSheetOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'list' | 'map'>('list');
  const [loadingActive, setLoadingActive] = React.useState(false);
  const [activeUsers, setActiveUsers] = React.useState<ActiveUser[]>([]);
  const [activePage, setActivePage] = React.useState(1);
  const PAGE_SIZE = 50;

  // 新增：總覽/場次/申請/串流
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [sessions, setSessions] = React.useState<SessionLite[]>([]);
  const [joins, setJoins] = React.useState<JoinReqLite[]>([]);
  const [cams, setCams] = React.useState<CamLite[]>([]);

  // 地圖載入（可選，未安裝會 fallback）
  let MapView: any = null;
  try {
    MapView = require('react-native-maps').default;
  } catch {
    MapView = null;
  }
  const [myLoc, setMyLoc] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supa.rpc('is_app_admin');
        if (!active) return;
        setAdmin(!error && !!data);
      } catch {
        if (!active) setAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 既有載入（聊天室/媒體）
  const loadChats = React.useCallback(async () => {
    const { data, error } = await supa
      .from('chat_messages')
      .select('id,match_id,user_name,text,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    setChats(
      (data || []).map((r: any) => ({
        id: r.id,
        user: r.user_name || null,
        text: r.text || '',
        created_at: r.created_at || new Date().toISOString(),
        match_id: r.match_id || undefined,
      })),
    );
  }, []);

  const loadClubChats = React.useCallback(async () => {
    const { data, error } = await supa
      .from('club_chats')
      .select('id,club_id,user_name,text,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    setClubChats(
      (data || []).map((r: any) => ({
        id: r.id,
        user: r.user_name || null,
        text: r.text || '',
        created_at: r.created_at || new Date().toISOString(),
        club_id: r.club_id || undefined,
      })),
    );
  }, []);

  const loadMedia = React.useCallback(async () => {
    const { data, error } = await supa
      .from('media')
      .select('id,owner_type,owner_id,kind,url,description,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    setMedia((data || []) as any);
  }, []);

  // 新增：總覽統計
  const loadOverview = React.useCallback(async () => {
    try {
      const since = minutesAgo(10);
      const [u, c, e, s, m, a] = await Promise.all([
        supa.from('profiles').select('id', { count: 'exact', head: true }),
        supa.from('clubs').select('id', { count: 'exact', head: true }),
        supa.from('events').select('id', { count: 'exact', head: true }),
        supa.from('sessions').select('id', { count: 'exact', head: true }),
        supa.from('media').select('id', { count: 'exact', head: true }),
        supa.from('user_presence').select('user_id').gte('last_seen_at', since),
      ]);
      setOverview({
        users: Number(u.count || 0),
        clubs: Number(c.count || 0),
        events: Number(e.count || 0),
        sessions: Number(s.count || 0),
        media: Number(m.count || 0),
        activeUsers: (a.data || []).length,
      });
    } catch {
      setOverview({
        users: 0, clubs: 0, events: 0, sessions: 0, media: 0, activeUsers: 0,
      });
    }
  }, []);

  // 新增：場次（最近 30 筆）+ rounds 彙整
  const loadSessions = React.useCallback(async () => {
    try {
      const { data, error } = await supa
        .from('sessions')
        .select('id,date,courts,round_minutes,created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      const list = (data || []) as Array<any>;
      const ids = list.map((s) => String(s.id));
      if (ids.length === 0) { setSessions([]); return; }

      const { data: rounds } = await supa
        .from('session_rounds')
        .select('session_id,index_no,status')
        .in('session_id', ids as any)
        .order('index_no', { ascending: true });

      const byId: Record<string, { rounds: number; last_round: number|null; last_status: string|null }> = {};
      (rounds || []).forEach((r:any) => {
        const sid = String(r.session_id);
        const idx = Number(r.index_no||0);
        if (!byId[sid]) byId[sid] = { rounds: 0, last_round: null, last_status: null };
        byId[sid].rounds += 1;
        if (byId[sid].last_round == null || idx > (byId[sid].last_round as number)) {
          byId[sid].last_round = idx;
          byId[sid].last_status = String(r.status || '');
        }
      });

      const out: SessionLite[] = list.map((s:any) => ({
        id: String(s.id),
        date: s.date || null,
        courts: Number(s.courts||0),
        round_minutes: Number(s.round_minutes||0),
        rounds: byId[s.id]?.rounds || 0,
        last_round: byId[s.id]?.last_round ?? null,
        last_status: byId[s.id]?.last_status ?? null,
      }));
      setSessions(out);
    } catch {
      setSessions([]);
    }
  }, []);

  // 新增：全站 join requests（pending）
  const loadJoinReqs = React.useCallback(async () => {
    try {
      const { data, error } = await supa
        .from('club_join_requests')
        .select('id,club_id,user_id,note,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data || []) as Array<any>;
      const uids = Array.from(new Set(rows.map(r => String(r.user_id))));
      let profiles: Record<string, { name?:string|null; email?:string|null }> = {};
      if (uids.length) {
        const { data: prof } = await supa.from('profiles').select('id,name,email').in('id', uids as any);
        (prof || []).forEach((p:any) => {
          profiles[String(p.id)] = { name: p.name || null, email: p.email || null };
        });
      }
      const out: JoinReqLite[] = rows.map(r => ({
        id: String(r.id),
        club_id: String(r.club_id),
        user_id: String(r.user_id),
        name: profiles[String(r.user_id)]?.name || null,
        email: profiles[String(r.user_id)]?.email || null,
        note: r.note || null,
        created_at: String(r.created_at || new Date().toISOString()),
      }));
      setJoins(out);
    } catch {
      setJoins([]);
    }
  }, []);

  // 新增：全站 cams（online within 1 分鐘）
  const loadCams = React.useCallback(async () => {
    try {
      const since = minutesAgo(1);
      const { data, error } = await supa
        .from('user_cams')
        .select('device_id,owner_id,name,platform,last_seen_at,status')
        .gte('last_seen_at', since)
        .eq('status','online')
        .order('last_seen_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data || []) as Array<any>;
      const owners = Array.from(new Set(rows.map(r => String(r.owner_id))));
      let profiles: Record<string, { name?:string|null; email?:string|null }> = {};
      if (owners.length) {
        const { data: prof } = await supa.from('profiles').select('id,name,email').in('id', owners as any);
        (prof || []).forEach((p:any) => {
          profiles[String(p.id)] = { name: p.name || null, email: p.email || null };
        });
      }
      setCams(rows.map(r => ({
        device_id: String(r.device_id),
        owner_id: String(r.owner_id),
        name: r.name || null,
        platform: r.platform || null,
        last_seen_at: r.last_seen_at || null,
        owner_meta: profiles[String(r.owner_id)] || {},
      })) as any);
    } catch {
      setCams([]);
    }
  }, []);

  // 撈 presence 10 分鐘內活躍（帶回 name/email）— 既有
  const loadActive = React.useCallback(async () => {
    setLoadingActive(true);
    setActivePage(1);
    try {
      const since = minutesAgo(10);
      const { data, error } = await supa
        .from('user_presence')
        .select('user_id,last_seen_at,lat,lng')
        .gte('last_seen_at', since)
        .order('last_seen_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const uids = Array.from(new Set((data || []).map((r: any) => String(r.user_id))));
      let meta: Record<string, { name?: string | null; email?: string | null }> = {};
      if (uids.length) {
        const { data: prof } = await supa.from('profiles').select('id,name,email').in('id', uids as any);
        (prof || []).forEach((p: any) => {
          meta[p.id] = {
            name: p?.name || null,
            email: p?.email || null,
          };
        });
      }
      const rows: ActiveUser[] = (data || []).map((r: any) => {
        const m = meta[String(r.user_id)] || {};
        return {
          id: String(r.user_id),
          name: m.name || null,
          email: m.email || null,
          updated_at: String(r.last_seen_at || new Date().toISOString()),
          lat: typeof r.lat === 'number' ? r.lat : null,
          lng: typeof r.lng === 'number' ? r.lng : null,
        };
      });
      setActiveUsers(rows);
    } catch {
      setActiveUsers([]);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  // 取管理者目前位置（用於地圖中心）— 既有
  const getMyLocation = React.useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        try {
          const ok = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (ok !== PermissionsAndroid.RESULTS.GRANTED) return;
        } catch {}
      }
      const geo = (navigator as any)?.geolocation;
      if (!geo || typeof geo.getCurrentPosition !== 'function') return;
      await new Promise<void>((resolve) => {
        geo.getCurrentPosition(
          (pos: any) => {
            const c = pos?.coords || {};
            if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
              setMyLoc({ lat: c.latitude, lng: c.longitude });
            }
            resolve();
          },
          () => resolve(),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 4000 },
        );
      });
    } catch {}
  }, []);

  const reloadAll = React.useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadOverview(),
        loadChats(),
        loadClubChats(),
        loadMedia(),
        loadActive(),
        loadSessions(),
        loadJoinReqs(),
        loadCams(),
      ]);
    } catch (e: any) {
      Alert.alert('載入失敗', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [loadOverview, loadChats, loadClubChats, loadMedia, loadActive, loadSessions, loadJoinReqs, loadCams]);

  React.useEffect(() => {
    if (admin) reloadAll();
  }, [admin, reloadAll]);

  // 既有：刪除功能
  const confirm = (msg: string, fn: () => void) => {
    Alert.alert('確認', msg, [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: fn },
    ]);
  };
  const delChat = async (id: string) => {
    try {
      await supa.from('chat_messages').delete().eq('id', id);
      await loadChats();
    } catch (e: any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  };
  const delClubChat = async (id: string) => {
    try {
      await supa.from('club_chats').delete().eq('id', id);
      await loadClubChats();
    } catch (e: any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  };
  const delMedia = async (row: MediaRow) => {
    try {
      if (row.kind === 'photo') {
        const path = publicUrlToPath(row.url);
        if (path) {
          try {
            await removeFile(path);
          } catch {}
        }
      }
      await supa.from('media').delete().eq('id', row.id);
      await loadMedia();
    } catch (e: any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  };

  const kw = q.trim().toLowerCase();
  const fChats = chats.filter(
    (r) =>
      !kw ||
      (r.text || '').toLowerCase().includes(kw) ||
      (r.user || '').toLowerCase().includes(kw) ||
      (r.match_id || '').toLowerCase().includes(kw),
  );
  const fClubChats = clubChats.filter(
    (r) =>
      !kw ||
      (r.text || '').toLowerCase().includes(kw) ||
      (r.user || '').toLowerCase().includes(kw) ||
      (r.club_id || '').toLowerCase().includes(kw),
  );
  const fMedia = media.filter(
    (r) =>
      !kw ||
      (r.url || '').toLowerCase().includes(kw) ||
      (r.description || '').toLowerCase().includes(kw) ||
      (r.owner_id || '').toLowerCase().includes(kw) ||
      (r.owner_type || '').toLowerCase().includes(kw),
  );

  if (admin === null || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#90caf9" />
      </View>
    );
  }
  if (!admin) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: '#fff' }}>沒有權限</Text>
      </View>
    );
  }

  const Chip = ({ text, active, onPress }: { text: string; active?: boolean; onPress: () => void }) => (
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

  const Section = ({ children }: any) => (
    <View style={{ marginTop: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 }}>
      {children}
    </View>
  );
  const Row = ({ left, right }: { left: any; right?: any }) => (
    <View
      style={{
        borderBottomWidth: 1,
        borderColor: '#2b2b2b',
        paddingVertical: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>{left}</View>
      {right}
    </View>
  );

  const renderChat = ({ item }: { item: ChatRow }) => (
    <Row
      left={
        <View>
          <Text style={{ color: '#90caf9' }}>{item.user || '匿名'} · Match {item.match_id || '-'}</Text>
          <Text style={{ color: '#ccc', marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</Text>
          <Text style={{ color: '#fff', marginTop: 6 }}>{item.text}</Text>
        </View>
      }
      right={
        <Pressable
          onPress={() => confirm('刪除此訊息？', () => delChat(item.id))}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.warn, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>刪除</Text>
        </Pressable>
      }
    />
  );
  const renderClubChat = ({ item }: { item: ClubChatRow }) => (
    <Row
      left={
        <View>
          <Text style={{ color: '#90caf9' }}>{item.user || '匿名'} · Club {item.club_id || '-'}</Text>
          <Text style={{ color: '#ccc', marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</Text>
          <Text style={{ color: '#fff', marginTop: 6 }}>{item.text}</Text>
        </View>
      }
      right={
        <Pressable
          onPress={() => confirm('刪除此訊息？', () => delClubChat(item.id))}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.warn, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>刪除</Text>
        </Pressable>
      }
    />
  );
  const renderMedia = ({ item }: { item: MediaRow }) => {
    const isYouTube = item.kind === 'youtube';
    const ytId = isYouTube ? getYouTubeId(item.url) : null;
    const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
    return (
      <Row
        left={
          <View>
            <Text style={{ color: '#90caf9' }}>
              {item.owner_type}/{item.owner_id}
            </Text>
            <Text style={{ color: '#ccc', marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</Text>
            <Text style={{ color: '#fff', marginTop: 6 }}>
              {isYouTube ? 'YouTube' : '照片'} · {item.url}
            </Text>
            {!!item.description && <Text style={{ color: '#ddd', marginTop: 4 }}>{item.description}</Text>}
            {isYouTube && thumb ? (
              <Pressable onPress={() => { try { Linking.openURL(item.url); } catch {} }} style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', width: 220 }}>
                <Image source={{ uri: thumb }} style={{ width: 220, height: 124 }} resizeMode="cover" />
              </Pressable>
            ) : (
              !isYouTube && (
                <View style={{ marginTop: 8 }}>
                  <Image source={{ uri: item.url }} style={{ width: 220, height: 140, borderRadius: 8, backgroundColor: '#333' }} resizeMode="cover" />
                </View>
              )
            )}
          </View>
        }
        right={
          <Pressable
            onPress={() => confirm('刪除此媒體？（照片將同時刪除雲端檔案）', () => delMedia(item))}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.warn, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff' }}>刪除</Text>
          </Pressable>
        }
      />
    );
  };

  // 觀眾 Sheet（線上使用者）
  const totalPages = Math.max(1, Math.ceil(activeUsers.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, activePage), totalPages);
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageRows = activeUsers.slice(startIdx, startIdx + PAGE_SIZE);
  const PageBtn = ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: disabled ? '#555' : C.btn, borderRadius: 8, marginLeft: 6 }}>
      <Text style={{ color: '#fff' }}>{title}</Text>
    </Pressable>
  );

  // 地圖 region
  const computeRegion = () => {
    const coords = activeUsers
      .filter((u) => typeof u.lat === 'number' && typeof u.lng === 'number')
      .map((u) => ({ latitude: u.lat as number, longitude: u.lng as number }));
    if (myLoc) coords.push({ latitude: myLoc.lat, longitude: myLoc.lng });
    if (!coords.length) {
      return { latitude: 25.034, longitude: 121.5645, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    }
    const lat = coords.reduce((a, c) => a + c.latitude, 0) / coords.length;
    const lng = coords.reduce((a, c) => a + c.longitude, 0) / coords.length;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.2, longitudeDelta: 0.2 };
  };

  // UI
  const TabBar = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <Chip text="總覽" active={tab === 'overview'} onPress={() => setTab('overview')} />
      <Chip text="賽事聊天室" active={tab === 'chat'} onPress={() => setTab('chat')} />
      <Chip text="社團聊天室" active={tab === 'club_chat'} onPress={() => setTab('club_chat')} />
      <Chip text="媒體" active={tab === 'media'} onPress={() => setTab('media')} />
      <Chip text="場次" active={tab === 'sessions'} onPress={() => setTab('sessions')} />
      <Chip text="串流" active={tab === 'cams'} onPress={() => setTab('cams')} />
      <Chip text="加入申請" active={tab === 'join'} onPress={() => setTab('join')} />

      <Pressable
        onPress={() => {
          setActiveSheetOpen(true);
          setActiveTab('list');
          if (activeUsers.length === 0) loadActive().catch(() => {});
        }}
        style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#6d4c41', borderRadius: 8, marginLeft: 8 }}
      >
        <Text style={{ color: '#fff' }}>On Line</Text>
      </Pressable>

      <Pressable onPress={reloadAll} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.btn, borderRadius: 8, marginLeft: 'auto' }}>
        <Text style={{ color: '#fff' }}>重整</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>社群管理（最大管理者）</Text>
      <TabBar />

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="搜尋（內容/使用者/擁有者ID/連結/Email/名稱）"
        placeholderTextColor="#888"
        style={{ borderWidth: 1, borderColor: '#444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', backgroundColor: '#111', marginBottom: 8 }}
      />

      {/* Overview */}
      {tab === 'overview' && (
        <View>
          <Section>
            {!overview ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator color="#90caf9" />
              </View>
            ) : (
              <View>
                <Text style={{ color:'#fff', fontWeight:'700', marginBottom: 8 }}>全站統計</Text>
                <Stat label="使用者" value={overview.users} />
                <Stat label="社團" value={overview.clubs} />
                <Stat label="賽事" value={overview.events} />
                <Stat label="場次" value={overview.sessions} />
                <Stat label="媒體" value={overview.media} />
                <Stat label="線上使用者（10 分鐘內）" value={overview.activeUsers} />
              </View>
            )}
          </Section>
        </View>
      )}

      {/* Chat */}
      {tab === 'chat' && (
        <Section>
          <FlatList data={fChats} keyExtractor={(i) => i.id} renderItem={renderChat} />
        </Section>
      )}

      {/* Club Chat */}
      {tab === 'club_chat' && (
        <Section>
          <FlatList data={fClubChats} keyExtractor={(i) => i.id} renderItem={renderClubChat} />
        </Section>
      )}

      {/* Media */}
      {tab === 'media' && (
        <Section>
          <FlatList data={fMedia} keyExtractor={(i) => i.id} renderItem={renderMedia} />
        </Section>
      )}

      {/* Sessions */}
      {tab === 'sessions' && (
        <Section>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom: 6 }}>最近場次（30）</Text>
          {sessions.length === 0 ? (
            <Text style={{ color:'#888' }}>尚無場次</Text>
          ) : (
            sessions.map(s => (
              <View key={s.id} style={{ borderBottomWidth:1, borderColor:'#2b2b2b', paddingVertical:8 }}>
                <Text style={{ color:'#90caf9', fontWeight:'700' }}>
                  {s.date || '—'} · {s.courts} 場 · {s.round_minutes} 分/輪
                </Text>
                <Text style={{ color:'#bbb', marginTop:2 }}>
                  輪數：{s.rounds}{s.last_round!=null ? `（最後：第 ${s.last_round} 輪 · ${s.last_status || '—'}）` : ''}
                </Text>
                <View style={{ flexDirection:'row', marginTop:6 }}>
                  <Pressable
                    onPress={() => navigation.navigate('ClubBoard', { sessionId: s.id })}
                    style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#5d4037', borderRadius:8, marginRight:8 }}
                  >
                    <Text style={{ color:'#fff' }}>看板</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </Section>
      )}

      {/* Cams */}
      {tab === 'cams' && (
        <Section>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>線上串流（1 分鐘內）</Text>
          {cams.length === 0 ? (
            <Text style={{ color:'#888' }}>目前沒有線上串流</Text>
          ) : (
            cams.map((c:any) => (
              <View key={c.device_id} style={{ borderBottomWidth:1, borderColor:'#2b2b2b', paddingVertical:8 }}>
                <Text style={{ color:'#fff', fontWeight:'700' }}>{c.name || (c.device_id.slice(0,8)+'…')}</Text>
                <Text style={{ color:'#bbb', marginTop:2 }}>
                  裝置：{c.device_id} · 平台：{c.platform || '-'}
                </Text>
                <Text style={{ color:'#bbb', marginTop:2 }}>
                  主人：{c.owner_meta?.name || (c.owner_id.slice(0,8)+'…')} · {c.owner_meta?.email || ''}
                </Text>
                <Text style={{ color:'#888', marginTop:2 }}>
                  最近：{c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : '-'}
                </Text>
                <View style={{ flexDirection:'row', marginTop:6 }}>
                  <Pressable
                    onPress={() => navigation.navigate('WebCamViewer', {
                      deviceId: c.device_id,
                      name: c.name || c.device_id.slice(0,8)+'…',
                      online: true,
                    })}
                    style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#1976d2', borderRadius:8 }}
                  >
                    <Text style={{ color:'#fff' }}>觀看</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </Section>
      )}

      {/* Join requests */}
      {tab === 'join' && (
        <Section>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom:6 }}>待審加入申請（全站）</Text>
          {joins.length === 0 ? (
            <Text style={{ color:'#888' }}>目前沒有待審申請</Text>
          ) : (
            joins.map(j => (
              <View key={j.id} style={{ borderBottomWidth:1, borderColor:'#2b2b2b', paddingVertical:8 }}>
                <Text style={{ color:'#fff', fontWeight:'700' }}>{j.name || (j.email ? j.email.split('@')[0] : j.user_id.slice(0,8)+'…')}</Text>
                {!!j.email && <Text style={{ color:'#bbb', marginTop:2 }}>{j.email}</Text>}
                {!!j.note && <Text style={{ color:'#ccc', marginTop:2 }}>備註：{j.note}</Text>}
                <Text style={{ color:'#888', marginTop:2 }}>{new Date(j.created_at).toLocaleString()}</Text>
                <View style={{ flexDirection:'row', marginTop:6 }}>
                  <Pressable
                    onPress={() => navigation.navigate('ClubJoinRequests', { clubId: j.club_id })}
                    style={{ paddingVertical:6, paddingHorizontal:10, backgroundColor:'#6d4c41', borderRadius:8 }}
                  >
                    <Text style={{ color:'#fff' }}>前往該社團審核</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </Section>
      )}

      {/* 線上使用者 Sheet（列表 / 地圖） */}
      <Modal visible={activeSheetOpen} transparent animationType="slide" onRequestClose={() => setActiveSheetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Chip text="列表" active={activeTab === 'list'} onPress={() => setActiveTab('list')} />
                <Chip
                  text="地圖"
                  active={activeTab === 'map'}
                  onPress={async () => {
                    setActiveTab('map');
                    if (!myLoc) await getMyLocation();
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => loadActive()} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.btn, borderRadius: 8, marginRight: 8 }}>
                  <Text style={{ color: '#fff' }}>{loadingActive ? '更新中…' : '重新整理'}</Text>
                </Pressable>
                <Pressable onPress={() => setActiveSheetOpen(false)} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#90caf9' }}>關閉</Text>
                </Pressable>
              </View>
            </View>

            {activeTab === 'list' ? (
              <>
                {loadingActive ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color="#90caf9" />
                  </View>
                ) : activeUsers.length === 0 ? (
                  <Text style={{ color: '#ccc', marginTop: 8 }}>目前沒有活躍中的使用者。</Text>
                ) : (
                  <>
                    <ScrollView style={{ maxHeight: '70%' }} contentContainerStyle={{ paddingBottom: 10 }}>
                      {pageRows.map((u) => {
                        const main = (u.email && u.email.trim()) || (u.name && u.name.trim()) || (u.id.slice(0, 8) + '…');
                        return (
                          <View key={u.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#2b2b2b' }}>
                            <Text style={{ color: '#fff', fontWeight: '600' }}>{main}</Text>
                            <Text style={{ color: '#888', marginTop: 2 }}>
                              最近活躍：{new Date(u.updated_at).toLocaleString()}
                            </Text>
                            <Text style={{ color: '#555', marginTop: 2 }}>ID: {u.id}</Text>
                            {typeof u.lat === 'number' && typeof u.lng === 'number' && (
                              <Text style={{ color: '#888', marginTop: 2 }}>
                                位置：{u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                      <Text style={{ color: '#bbb', marginRight: 8 }}>
                        第 {page} / {totalPages} 頁（每頁 {PAGE_SIZE} 人）
                      </Text>
                      <PageBtn title="上一頁" onPress={() => setActivePage((p) => Math.max(1, p - 1))} disabled={page <= 1} />
                      <PageBtn title="下一頁" onPress={() => setActivePage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} />
                    </View>
                  </>
                )}
              </>
            ) : (
              <View style={{ height: 360, marginTop: 8 }}>
                {!MapView ? (
                  <Text style={{ color: '#ccc' }}>
                    尚未安裝 react-native-maps，無法顯示地圖。請先安裝套件後再試。
                  </Text>
                ) : loadingActive ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color="#90caf9" />
                  </View>
                ) : (
                  <MapView style={{ flex: 1, borderRadius: 10 }} initialRegion={computeRegion()} showsUserLocation={true} followsUserLocation={true}>
                    {activeUsers
                      .filter((u) => typeof u.lat === 'number' && typeof u.lng === 'number')
                      .map((u) => {
                        const main = (u.email && u.email.trim()) || (u.name && u.name.trim()) || (u.id.slice(0, 8) + '…');
                        return (
                          <MapView.Marker
                          key={u.id}
                          coordinate={{ latitude: u.lat as number, longitude: u.lng as number }}
                          title={main}
                          description={`最近活躍：${new Date(u.updated_at).toLocaleString()}`}
                          />
                        );
                      })}
                  </MapView>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderColor:'#2b2b2b', paddingVertical:8 }}>
      <Text style={{ color:'#ddd' }}>{label}</Text>
      <Text style={{ color:'#fff', fontWeight:'800' }}>{value}</Text>
    </View>
  );
}