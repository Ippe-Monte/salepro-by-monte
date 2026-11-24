import { View } from 'react-native';
import { Body, Button } from './kit';
import { Text } from './Text';
import { colors } from './theme';

/** Read-only detail lines: label on the left, value on the right. Empty values show "-". */
export function DetailRows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <View style={{ marginVertical: 6 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
          <Text style={{ color: colors.muted }}>{k}</Text>
          <Text style={{ color: colors.text, flexShrink: 1, textAlign: 'right' }}>{v && String(v).trim() ? v : '-'}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * View/edit switch for any record: while viewing, only an "Edit" button (and a "saved" note after saving);
 * the Save and Cancel buttons exist only while editing.
 */
export function EditActions({ editing, canEdit, busy, saved, onEdit, onSave, onCancel }: {
  editing: boolean; canEdit: boolean; busy?: boolean; saved?: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  if (!editing) {
    return (
      <View style={{ marginTop: 6 }}>
        {saved ? <Body tone="ok">บันทึกเรียบร้อยแล้ว</Body> : null}
        {canEdit ? <Button title="แก้ไข" variant="ghost" icon="pencil" onPress={onEdit} /> : null}
      </View>
    );
  }
  return (
    <View style={{ marginTop: 6 }}>
      <Button title="บันทึก" busy={busy} onPress={onSave} />
      <Button title="ยกเลิก" variant="ghost" onPress={onCancel} />
    </View>
  );
}
