import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';

type Props = {
  visible: boolean;
  data: { id: string; kind: 'win' | 'loss'; meta: any } | null;
  onClose: () => void;
  onDelete: (id: string) => void;
};

export default function MarkerSheet({ visible, data, onClose, onDelete }: Props) {
  if (!data) return null;
  const { id, kind, meta } = data;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, padding:16, maxHeight:'70%' }}>
          <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>落點詳情</Text>
          <Text style={{ marginBottom:8 }}>結果：{kind === 'win' ? '得分' : '失分'}</Text>
          <ScrollView style={{ maxHeight:300 }}>
            <Text selectable style={{ color:'#444' }}>{JSON.stringify(meta || {}, null, 2)}</Text>
          </ScrollView>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:12 }}>
            <Pressable onPress={() => onDelete(id)} style={{ padding:12, backgroundColor:'#d32f2f', borderRadius:8 }}>
              <Text style={{ color:'#fff' }}>刪除此筆</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ padding:12 }}>
              <Text>關閉</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
