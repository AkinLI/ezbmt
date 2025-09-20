import * as React from 'react';
import { StatusBar, useColorScheme, Linking } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/AppNavigator';
import { startSyncLoop, stopSyncLoop } from './src/lib/sync';
import GlobalBackground from './src/components/GlobalBackground';
import { useBgStore } from './src/store/bg';
import { supa } from './src/lib/supabase';

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

// 這些畫面不顯示背景（依你的命名調整）
const EXCLUDE_BG = React.useMemo(
() =>
new Set([
'Record', // 記錄
'SpeedCam', // 測速
'Analysis', // 分析
]),
[]
);

// 是否顯示背景
const showBg = signedIn && routeName && !EXCLUDE_BG.has(routeName);

// 深連結處理（Email 驗證回跳）
React.useEffect(() => {
const handleUrl = (urlStr: string) => {
try {
const u = new URL(urlStr);
const code = u.searchParams.get('code') || u.searchParams.get('token');
if (code) {
// supabase-js v2: 傳入字串
supa.auth.exchangeCodeForSession(code).catch(() => {});
}
} catch {}
};

// App 冷啟時的連結
Linking.getInitialURL().then((initialUrl) => {
  if (initialUrl) handleUrl(initialUrl);
});

// App 前景時的連結
const sub = Linking.addEventListener('url', ({ url }: { url: string }) => handleUrl(url));
return () => sub.remove();
}, []);

React.useEffect(() => {
startSyncLoop();
// 載入本機背景設定（登入後才會渲染）
useBgStore.getState().load().catch(() => {});

// 初始化與監聽登入狀態
(async () => {
  try {
    const { data } = await supa.auth.getUser();
    setSignedIn(!!data?.user);
  } catch {
    setSignedIn(false);
  }
})();

const { data: sub } = supa.auth.onAuthStateChange((_event, session) => {
  setSignedIn(!!session?.user);
});

return () => {
  stopSyncLoop();
  try {
    sub?.subscription?.unsubscribe?.();
  } catch {}
};
}, []);

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

  {/* 只有登入後且不在排除清單才顯示背景 */}
  {showBg ? <GlobalBackground /> : null}
</SafeAreaProvider>
);
}