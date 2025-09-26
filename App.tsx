import * as React from 'react';
import { StatusBar, useColorScheme, Linking } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/AppNavigator';
import { startSyncLoop, stopSyncLoop } from './src/lib/sync';
import GlobalBackground from './src/components/GlobalBackground';
import { useBgStore } from './src/store/bg';
import { supa } from './src/lib/supabase';
import { startPresenceHeartbeat } from './src/lib/presence';
import { initPushIfAvailable } from './src/lib/push';
import { startSyncDownLoop, stopSyncDownLoop } from './src/lib/syncDown';

export const AdminCtx = React.createContext<{ isAdmin: boolean }>({ isAdmin: false });

async function fetchIsAdmin(): Promise<boolean> {
  try {
    const { data } = await supa.rpc('is_app_admin');
    return !!data;
  } catch {
    return false;
  }
}

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  // 登入狀態：未登入不顯示背景
  const [signedIn, setSignedIn] = React.useState(false);

  // 取得目前 Route 名稱，用來決定哪些畫面要隱藏背景
  const navRef = useNavigationContainerRef();
  const [routeName, setRouteName] = React.useState<string | undefined>(undefined);

  const EXCLUDE_BG = React.useMemo(
    () =>
      new Set([
        'Record',
        'SpeedCam',
        'Analysis',
        'Replay',
        'QuickScoreboard',
      ]),
    [],
  );

  const showBg = signedIn && routeName && !EXCLUDE_BG.has(routeName);

  // 深連結處理（Email 驗證回跳）
  React.useEffect(() => {
startSyncLoop();
startSyncDownLoop();              // 新增：啟動下行同步循環（內部會檢查是否登入）
useBgStore.getState().load().catch(() => {});

let stopPresence: undefined | (() => void);

(async () => {
  try {
    const { data } = await supa.auth.getUser();
    setSignedIn(!!data?.user);
    if (data?.user) {
      stopPresence = startPresenceHeartbeat(30_000);
    }
  } catch {
    setSignedIn(false);
  }
})();

const { data: authSub } = supa.auth.onAuthStateChange((_event, session) => {
  const on = !!session?.user;
  setSignedIn(on);
  try { stopPresence?.(); } catch {}
  stopPresence = on ? startPresenceHeartbeat(30_000) : undefined;
  // 下行同步循環本身有登入檢查，維持常駐即可；若你想更嚴格，也可在這裡 on/off：
  // if (on) startSyncDownLoop(); else stopSyncDownLoop();
});

return () => {
  stopSyncLoop();
  stopSyncDownLoop();             // 新增：清除下行循環
  try { authSub?.subscription?.unsubscribe?.(); } catch {}
  try { stopPresence?.(); } catch {}
};
}, []);

  // Sync + 背景 + Auth 狀態 + Presence 心跳
  React.useEffect(() => {
    startSyncLoop();
    useBgStore.getState().load().catch(() => {});

    let stopPresence: undefined | (() => void);

    (async () => {
      try {
        const { data } = await supa.auth.getUser();
        setSignedIn(!!data?.user);
        if (data?.user) {
          stopPresence = startPresenceHeartbeat(30_000);
        }
      } catch {
        setSignedIn(false);
      }
    })();

    const { data: authSub } = supa.auth.onAuthStateChange((_event, session) => {
      const on = !!session?.user;
      setSignedIn(on);
      try {
        stopPresence?.();
      } catch {}
      stopPresence = on ? startPresenceHeartbeat(30_000) : undefined;
    });

    return () => {
      stopSyncLoop();
      try {
        authSub?.subscription?.unsubscribe?.();
      } catch {}
      try {
        stopPresence?.();
      } catch {}
    };
  }, []);

  // 新增：登入後嘗試初始化推播（可選；未安裝 firebase/messaging 也會自動略過）
  React.useEffect(() => {
    if (!signedIn) return;
    initPushIfAvailable().catch(() => {});
  }, [signedIn]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer
        ref={navRef}
        onReady={() => setRouteName(navRef.getCurrentRoute()?.name)}
        onStateChange={() => setRouteName(navRef.getCurrentRoute()?.name)}
      >
        <AppNavigator />
      </NavigationContainer>

      {showBg ? <GlobalBackground /> : null}
    </SafeAreaProvider>
  );
}