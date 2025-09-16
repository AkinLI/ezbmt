import React from 'react';
import { View, Text, FlatList, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BACKEND } from '../lib/backend';
import { listEvents, insertEvent, listMyEvents, createEventRPC, hasEventMatches, deleteEvent } from '../db';
import { getCurrentUser, supa } from '../lib/supabase';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EventsScreen() {
  const nav = useNavigation<any>();
  const [items, setItems] = React.useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = React.useState('');
  const [myName, setMyName] = React.useState<string>('');

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const INPUT_BAR_H = 44;

  const load = React.useCallback(async () => {
    try {
      if (BACKEND === 'supabase') {
        const rows = await listMyEvents();
        setItems(rows);
      } else {
        setItems(await listEvents());
      }
    } catch (e: any) {
      Alert.alert('載入失敗', String(e?.message || e));
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        if (BACKEND === 'supabase') {
          const u = await getCurrentUser();
          if (!u && active) {
            // @ts-ignore
            nav.navigate('Auth');
            return;
          }
          try {
            if (u && active) {
              const { data } = await supa.from('profiles').select('name').eq('id', u.id).single();
              if (active) setMyName((data?.name || '').trim());
            }
          } catch {
            if (active) setMyName('');
          }
        }
        if (active) load();
      })();
      return () => { active = false; };
    }, [load, nav])
  );

  const add = async () => {
    const nm = name.trim(); if (!nm) return;
    try {
      if (BACKEND === 'supabase') {
        await createEventRPC({ name: nm });
      } else {
        const id = Math.random().toString(36).slice(2);
        await insertEvent({ id, name: nm } as any);
      }
      setName('');
      load();
    } catch (e: any) {
      Alert.alert('新增失敗', String(e?.message || e));
    }
  };

  const onDeleteEvent = async (eventId: string) => {
    try {
      const has = await hasEventMatches(eventId);
      if (has) {
        Alert.alert('無法刪除', '此賽事已有場次資料，不可刪除');
        return;
      }
      Alert.alert('刪除賽事', '確定要刪除此賽事？', [
        { text: '取消', style: 'cancel' },
        { text: '刪除', style: 'destructive', onPress: async () => {
            try { await deleteEvent(eventId); await load(); }
            catch(e:any){ Alert.alert('刪除失敗', String(e?.message || e)); }
          } },
      ]);
    } catch (e:any) {
      Alert.alert('刪除失敗', String(e?.message || e));
    }
  };

  const renderItem = ({ item }: { item: { id: string; name: string } }) => (
    <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8 }}>
      <Pressable onPress={() => nav.navigate('Matches', { eventId: item.id })}>
        <Text style={{ fontSize: 16 }}>{item.name}</Text>
        <Text style={{ color: '#666', marginTop: 4 }}>點擊進入場次管理</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Pressable
          onPress={() => nav.navigate('EventMembers', { eventId: item.id })}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#7b1fa2', borderRadius: 8, marginRight: 8 }}
        >
          <Text style={{ color: '#fff' }}>成員</Text>
        </Pressable>
        <Pressable
          onPress={() => onDeleteEvent(item.id)}
          style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#d32f2f', borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>刪除</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={{ flex: 1, padding: 12, paddingBottom: (insets.bottom || 12) + INPUT_BAR_H + 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Pressable
            onPress={() => nav.navigate('JoinEvent')}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#00897b', borderRadius: 8, marginRight: 6 }}
          >
            <Text style={{ color: '#fff' }}>加入事件</Text>
          </Pressable>
          <Pressable
            onPress={() => nav.navigate('Profile')}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#607d8b', borderRadius: 8, marginRight: 6 }}
          >
            <Text style={{ color: '#fff' }}>{myName ? `個人：${myName}` : '個人'}</Text>
          </Pressable>
          <Pressable
            onPress={() => nav.navigate('Settings')}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#455a64', borderRadius: 8, marginRight: 6 }}
          >
            <Text style={{ color: '#fff' }}>設定</Text>
          </Pressable>
          <Pressable
            onPress={() => nav.navigate('SpeedCam')}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#2e7d32', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff' }}>測速</Text>
          </Pressable>
        </View>

        {BACKEND === 'supabase' && myName ? (
          <Text style={{ color: '#333', marginBottom: 8 }}>我的暱稱：{myName}</Text>
        ) : null}

        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>賽事清單</Text>
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
        />
      </View>

      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: (insets.bottom || 0) + 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: INPUT_BAR_H,
        }}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="新增賽事名稱"
          style={{ flex: 1, height: INPUT_BAR_H, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff' }}
          returnKeyType="done"
        />
        <Pressable
          onPress={add}
          style={{ backgroundColor: '#1976d2', paddingHorizontal: 16, height: INPUT_BAR_H, borderRadius: 8, justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff' }}>新增</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}