 import React from 'react'; 
 import { View, Text, TextInput, Pressable, Alert, Image, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar, } from 'react-native'; 
 import { supa, getCurrentUser } from '../lib/supabase';
const ACTION_IMG = require('../images/action.png'); // 確認路徑

export default function AuthScreen({ navigation }: any) {
const [email, setEmail] = React.useState('');
const [password, setPassword] = React.useState('');
const [busy, setBusy] = React.useState(false);
const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');

React.useEffect(() => {
(async () => {
const u = await getCurrentUser();
if (u) navigation.replace('Home');
})();
}, [navigation]);

const submit = async () => {
const addr = (email ?? '').trim();
const pwd = password;
if (!addr || !pwd) return;
setBusy(true);
try {
// 和 Supabase 後台 Additional Redirect URLs 對應的 Deep Link
const redirectTo = Platform.select({
ios: 'ezbmt://auth-callback',
android: 'ezbmt://auth-callback',
default: 'ezbmt://auth-callback',
}) as string;

  if (mode === 'signin') {
    const { error } = await supa.auth.signInWithPassword({ email: addr, password: pwd });
    if (error) throw error;
  } else {
    const { error } = await supa.auth.signUp({
      email: addr,
      password: pwd,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    Alert.alert('已送出確認信', '請到信箱點擊驗證連結完成註冊');
  }
  navigation.replace('Home');
} catch (e: any) {
  Alert.alert('失敗', String(e?.message || e));
} finally {
  setBusy(false);
}
};

return (
<SafeAreaView style={{ flex: 1, backgroundColor: '#f2f5f6' }}>
<StatusBar barStyle={Platform.OS === 'ios' ? 'dark-content' : 'default'} />
<KeyboardAvoidingView
style={{ flex: 1 }}
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
>
<ScrollView
contentContainerStyle={{ flexGrow: 1, padding: 16, justifyContent: 'center' }}
keyboardShouldPersistTaps="handled"
>
<View
style={{
backgroundColor: '#fff',
borderRadius: 18,
paddingTop: 20,
paddingBottom: 24,
paddingHorizontal: 16,
shadowColor: '#000',
shadowOpacity: 0.08,
shadowOffset: { width: 0, height: 4 },
shadowRadius: 12,
elevation: 2,
}}
>
<Text
style={{
fontSize: 20,
fontWeight: '800',
color: '#1B5E20',
textAlign: 'center',
marginBottom: 10,
}}
>
LBF能力有限 羽球分析平台
</Text>

        <Image
          source={ACTION_IMG}
          resizeMode="contain"
          style={{ width: '100%', height: 90, marginBottom: 14 }}
        />

        <View style={{ height: 1, backgroundColor: '#E9ECEF', marginBottom: 16 }} />

        <Text style={{ marginBottom: 6, color: '#333', fontSize: 16 }}>帳號：</Text>
        <TextInput
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          style={{
            backgroundColor: '#f6f7f8',
            borderWidth: 1,
            borderColor: '#E0E0E0',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 16,
          }}
        />

        <Text style={{ marginBottom: 6, color: '#333', fontSize: 16 }}>密碼：</Text>
        <TextInput
          placeholder="請輸入密碼"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          onSubmitEditing={!busy ? submit : undefined}
          style={{
            backgroundColor: '#f6f7f8',
            borderWidth: 1,
            borderColor: '#E0E0E0',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 24,
          }}
        />

        <Pressable
          disabled={busy}
          onPress={submit}
          style={{
            alignSelf: 'center',
            width: '86%',
            backgroundColor: '#0E8F64',
            borderRadius: 22,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '800', letterSpacing: 1 }}>
              {mode === 'signin' ? '登入' : '註冊'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          style={{ marginTop: 14, alignSelf: 'center' }}
        >
          <Text style={{ color: '#1976d2' }}>
            {mode === 'signin' ? '沒有帳號？前往註冊' : '已有帳號？前往登入'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
</SafeAreaView>
);
}