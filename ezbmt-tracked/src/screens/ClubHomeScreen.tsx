import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const C = {
bg: '#111',
card: '#1e1e1e',
text: '#fff',
sub: '#bbb',
btn: '#1976d2',
};

export default function ClubHomeScreen() {
const navigation = useNavigation<any>();
return (
<View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
<Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>社團管理</Text>
<Text style={{ color: C.sub, marginBottom: 16 }}>（開發中，將包含計分板、社團留言板、成員管理等）</Text>
<Pressable
onPress={() => navigation.goBack()}
style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.btn, borderRadius: 10 }}
>
<Text style={{ color: '#fff' }}>返回</Text>
</Pressable>
</View>
);
}