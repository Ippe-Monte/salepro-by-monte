import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { monthGrid, pad2, shiftMonth, ymd } from '@/lib/calendar';
import { dateLocale } from '@/i18n';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './theme';

const trigger = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as const;

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="ปิด" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 18, padding: 16 }}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

export function fmtDate(d: string): string {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!t) return d;
  return new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3])).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Calendar date picker. value/onChange use "YYYY-MM-DD". `marks` = days that get a dot. */
export function CalendarGrid({ value, onChange, marks }: { value: string; onChange: (d: string) => void; marks?: Set<string> }) {
  const sel = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const now = new Date();
  const [view, setView] = useState({ year: sel ? Number(sel[1]) : now.getFullYear(), month0: sel ? Number(sel[2]) - 1 : now.getMonth() });
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const title = new Date(view.year, view.month0, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  const wd = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'narrow' }));
  const nav = (label: string, d: number, icon: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setView(shiftMonth(view.year, view.month0, d))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={colors.text} />
    </Pressable>
  );
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {nav('เดือนก่อน', -1, 'chevron-left')}
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{title}</Text>
        {nav('เดือนถัดไป', 1, 'chevron-right')}
      </View>
      <View style={{ flexDirection: 'row' }}>{wd.map((w, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' }}>{w}</Text>)}</View>
      {monthGrid(view.year, view.month0).map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((d, di) => {
            if (d === null) return <View key={di} style={{ flex: 1, height: 44 }} />;
            const key = ymd(view.year, view.month0, d);
            const on = key === value;
            return (
              <Pressable key={di} accessibilityRole="button" accessibilityLabel={key} onPress={() => onChange(key)} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : 'transparent', borderWidth: key === today && !on ? 1 : 0, borderColor: colors.primary }}>
                  <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: on || key === today ? '800' : '500' }}>{d}</Text>
                </View>
                {marks?.has(key) ? <View style={{ position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: on ? colors.onPrimary : colors.accent }} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={trigger}>
        <Text style={{ color: colors.text, fontSize: 16 }}>{fmtDate(value)}</Text>
        <Icon name="schedule" size={20} color={colors.muted} />
      </Pressable>
      {open ? <Sheet onClose={() => setOpen(false)}><CalendarGrid value={value} onChange={(d) => { onChange(d); setOpen(false); }} /></Sheet> : null}
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS = Array.from({ length: 12 }, (_, i) => i * 5);

function Column({ values, selected, onPick, label }: { values: number[]; selected: number; onPick: (n: number) => void; label: string }) {
  return (
    <ScrollView style={{ height: 220, flex: 1 }} contentOffset={{ x: 0, y: Math.max(0, values.indexOf(selected) - 2) * 44 }} accessibilityLabel={label}>
      {values.map((n) => (
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${label} ${pad2(n)}`} onPress={() => onPick(n)} style={{ height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: n === selected ? colors.primary : 'transparent' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: n === selected ? colors.onPrimary : colors.text }}>{pad2(n)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Digital 24-hour time picker, value "HH:MM" (minutes in 5-minute steps). */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const h = m ? Number(m[1]) : 9;
  const mi = m ? Number(m[2]) : 0;
  const mins = MINS.includes(mi) ? MINS : [...MINS, mi].sort((a, b) => a - b);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13 }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={trigger}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: 1 }}>{pad2(h)}:{pad2(mi)}</Text>
        <Icon name="clock" size={20} color={colors.muted} />
      </Pressable>
      {open ? (
        <Sheet onClose={() => setOpen(false)}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>{pad2(h)}:{pad2(mi)}</Text></View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Column values={HOURS} selected={h} onPick={(n) => onChange(`${pad2(n)}:${pad2(mi)}`)} label="ชั่วโมง" />
            <Column values={mins} selected={mi} onPick={(n) => onChange(`${pad2(h)}:${pad2(n)}`)} label="นาที" />
          </View>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ marginTop: 12, minHeight: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>ตกลง</Text>
          </Pressable>
        </Sheet>
      ) : null}
    </View>
  );
}
