import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supa } from '../lib/supabase';

const C = {
bg: '#111',
card: '#1e1e1e',
border: '#333',
text: '#fff',
sub: '#bbb',
primary: '#1976d2',
accent: '#009688',
warn: '#d32f2f',
gray: '#616161',
dark: '#000000',
Setting: '#455a64',
};

export default function HomeScreen() {
const navigation = useNavigation<any>();
const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

// 未登入導回 Auth；同時嘗試取得是否為最大管理者
useFocusEffect(
React.useCallback(() => {
let active = true;
(async () => {
try {
const { data } = await supa.auth.getUser();
if (active && !data?.user) {
navigation.replace('Auth');
return;
}
} catch {
if (active) {
navigation.replace('Auth');
return;
}
}

    // 取得是否為最大管理者（is_app_admin）
    try {
      const { data, error } = await supa.rpc('is_app_admin');
      if (active) setIsAdmin(!error && !!data);
    } catch {
      if (active) setIsAdmin(false);
    }
  })();
  return () => {
    active = false;
  };
}, [navigation])
);

const Button = ({ title, color, onPress }: { title: string; color: string; onPress: () => void }) => (
<Pressable
onPress={onPress}
style={{
backgroundColor: color,
borderRadius: 14,
paddingVertical: 16,
paddingHorizontal: 20,
marginBottom: 14,
alignItems: 'center',
}}
>
<Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>{title}</Text>
</Pressable>
);

return (
<View style={{ flex: 1, backgroundColor: C.bg }}>
<ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, justifyContent: 'center' }}>
{/* APP 名稱（第一行） */}
<Text style={{ color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 22 }}>
LBF能力有限羽球分析平台ezbmt
</Text>

    <View style={{ maxWidth: 480, alignSelf: 'center', width: '100%' }}>
      <Button title="賽事管理" color={C.primary} onPress={() => navigation.navigate('Events')} />
      <Button title="社團管理" color={C.accent} onPress={() => navigation.navigate('Clubs')} />
      <Button title="個人設定" color={C.gray} onPress={() => navigation.navigate('Profile')} />

      {/* 僅最大管理者顯示「測速」 */}
      {isAdmin && (
        <Button title="測速" color={C.dark} onPress={() => navigation.navigate('SpeedCam')} />
      )}
      {/* 僅最大管理者顯示「基本設定」 */}
      {isAdmin && (
      <Button title="基本設定" color={C.Setting} onPress={() => navigation.navigate('Settings')} />
      )}

      <Button
        title="登出"
        color={C.warn}
        onPress={async () => {
          try {
            await supa.auth.signOut();
          } catch {}
          navigation.replace('Auth');
        }}
      />
    </View>
  </ScrollView>
</View>
);
}