import React from 'react';
import { View, Text, TextInput, Pressable, Platform, Modal } from 'react-native';

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s: string): Date | null {
if (!s) return null;
const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
if (!m) return null;
const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
return Number.isFinite(d.getTime()) ? d : null;
}

export default function DateField({
label,
value,
onChange,
placeholder = 'YYYY-MM-DD',
}: {
label?: string;
value: string;
onChange: (v: string) => void;
placeholder?: string;
}) {
const [show, setShow] = React.useState(false);
const [iosTmp, setIosTmp] = React.useState<Date>(() => parseYmd(value) || new Date());

let DateTimePicker: any = null;
try {
DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {}

const open = () => {
if (!DateTimePicker) return;
if (Platform.OS === 'android') {
setShow(true);
} else {
setIosTmp(parseYmd(value) || new Date());
setShow(true);
}
};
const close = () => setShow(false);

return (
<View style={{ marginBottom: 10 }}>
{!!label && <Text style={{ color: '#e0e0e0', marginBottom: 6 }}>{label}</Text>}

  <View style={{ flexDirection: 'row' }}>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#9aa0a6"
      selectionColor="#90caf9"
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: '#555',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        color: '#ffffff',
        backgroundColor: '#0f1113',
        marginRight: 8,
      }}
    />

    {!!DateTimePicker && (
      <Pressable
        onPress={open}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: '#1976d2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>選取日期</Text>
      </Pressable>
    )}
  </View>

  {/* Android 直接用原生彈窗 */}
  {show && DateTimePicker && Platform.OS === 'android' && (
    <DateTimePicker
      value={parseYmd(value) || new Date()}
      mode="date"
      display="default"
      onChange={(_: any, d?: Date) => {
        setShow(false);
        if (d) onChange(fmt(d));
      }}
    />
  )}

  {/* iOS：亮色系彈窗＋強制 light 主題 */}
  {show && DateTimePicker && Platform.OS === 'ios' && (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          // 淺一點的遮罩，避免整塊黑
          backgroundColor: 'rgba(0,0,0,0.12)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: '#ffffff',
            padding: 12,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <DateTimePicker
            value={iosTmp}
            mode="date"
            display="spinner"
            // 這兩個只在 iOS 有效：強制淺色與字色黑
            themeVariant="light"
            textColor="#000000"
            // 高亮色
            accentColor="#1976d2"
            onChange={(_: any, d?: Date) => {
              if (d) setIosTmp(d);
            }}
            style={{ backgroundColor: '#ffffff' }}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
            <Pressable onPress={close} style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}>
              <Text style={{ color: '#1976d2', fontWeight: '600' }}>取消</Text>
            </Pressable>
            <Pressable
              onPress={() => { onChange(fmt(iosTmp)); close(); }}
              style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#1976d2', borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>完成</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )}
</View>
);
}