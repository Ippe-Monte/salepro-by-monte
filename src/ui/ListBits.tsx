import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './theme';

/** Header row of a list page: the "+ add" button that opens or closes the add form. */
export function AddToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 12, backgroundColor: open ? 'transparent' : colors.cta, borderWidth: open ? 1 : 0, borderColor: colors.border, marginBottom: 12 }}>
      <Icon name={open ? 'x' : 'plus'} size={20} color={open ? colors.text : colors.onCta} />
      <Text style={{ color: open ? colors.text : colors.onCta, fontWeight: '700' }}>{open ? 'ปิดฟอร์ม' : label}</Text>
    </Pressable>
  );
}

/** Heading row of a list page: the title on the left and a small "+ add" pill on the right (opens or closes the add form). */
export function TitleAdd({ title, show, open, onToggle, label = 'เพิ่ม' }: { title: string; show: boolean; open: boolean; onToggle: () => void; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700', flexShrink: 1 }}>{title}</Text>
      {show ? (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onToggle}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: open ? 'transparent' : colors.cta, borderWidth: open ? 1 : 0, borderColor: colors.border }}>
          <Icon name={open ? 'x' : 'plus'} size={16} color={open ? colors.text : colors.onCta} />
          <Text style={{ color: open ? colors.text : colors.onCta, fontWeight: '700', fontSize: 14 }}>{open ? 'ปิด' : label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Trash button that asks once before calling onConfirm (nothing is deleted by a single tap). */
export function ConfirmTrash({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setAsk(true)} style={{ padding: 8 }}><Icon name="trash" size={20} color={colors.danger} /></Pressable>;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => { setAsk(false); onConfirm(); }} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.danger }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>ยืนยันลบ</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setAsk(false)} style={{ padding: 8 }}><Text style={{ color: colors.muted, fontSize: 13 }}>ยกเลิก</Text></Pressable>
    </View>
  );
}
