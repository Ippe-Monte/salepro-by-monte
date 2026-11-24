import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { friendly } from '@/lib/errors';
import { toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage } from '@/lib/pickImage';
import { buildVCard } from '@/lib/vcard';
import { Avatar, refreshAvatar, useAvatarUri } from './Avatar';
import { BusinessCard, CARD_THEMES, type CardTheme } from './BusinessCard';
import { Icon } from './Icon';
import { Body, Button, Card, Chips, Field } from './kit';
import { useOrgLogoUri } from './OrgLogo';
import { Text } from './Text';
import { colors } from './theme';

const THEME_LABEL: Record<CardTheme, string> = { blue: 'น้ำเงิน', dark: 'ดำ', green: 'เขียว', orange: 'ส้ม', purple: 'ม่วง' };

/** Saves the card as a .vcf and opens the phone's share sheet (Quick Share on Android, AirDrop on iPhone). */
export async function shareVCard(vcf: string, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (Platform.OS !== 'web') {
    try { await Share.share({ message: vcf }); return 'shared'; } catch { return 'cancelled'; }
  }
  const file = new File([vcf], `${name.replace(/[^\w฀-๿ -]/g, '') || 'contact'}.vcf`, { type: 'text/vcard' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return 'shared'; } catch { return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  return 'downloaded';
}

export function ProfileCard() {
  const { profile, current, refresh } = useAuth();
  const avatar = useAvatarUri();
  const logo = useOrgLogoUri();
  const [f, setF] = useState({ name: '', phone: '', position: '', department: '', line: '', website: '', theme: 'blue' as CardTheme, showLogo: 'y', showPhoto: 'y' });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setF({ name: profile.display_name ?? '', phone: profile.phone ?? '', position: profile.position ?? '', department: profile.department ?? '', line: profile.line_id ?? '', website: profile.website ?? '',
      theme: profile.card_theme ?? 'blue', showLogo: profile.card_show_logo === false ? 'n' : 'y', showPhoto: profile.card_show_photo === false ? 'n' : 'y' });
  }, [profile]);

  const company = current?.org.name ?? '';
  const vcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, department: f.department, phone: f.phone, email: profile?.email, website: f.website, lineId: f.line, address: current?.org.address }), [f, company, profile?.email, current?.org.address]);

  // The QR carries a compact card (no address) so it stays easy to scan; the shared .vcf file has everything.
  const qrVcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, phone: f.phone, email: profile?.email, lineId: f.line }), [f.name, company, f.position, f.phone, f.line, profile?.email]);

  async function save() {
    if (!profile || busy) return;
    if (!f.name.trim()) return setMsg({ text: 'กรอกชื่อ', ok: false });
    setBusy(true);
    const { error } = await neon.from('profiles').update({
      display_name: f.name.trim(), phone: f.phone.trim() || null, position: f.position.trim() || null, department: f.department.trim() || null,
      line_id: f.line.trim() || null, website: f.website.trim() || null, card_theme: f.theme, card_show_logo: f.showLogo === 'y', card_show_photo: f.showPhoto === 'y',
    }).eq('id', profile.id);
    setBusy(false);
    if (error) return setMsg({ text: friendly(error), ok: false });
    setMsg({ text: 'บันทึกข้อมูลส่วนตัวแล้ว', ok: true });
    await refresh();
  }

  async function photo() {
    if (!profile) return;
    const p = await pickImage({ maxSide: 400, format: 'jpeg' });
    if (p === null) return;
    if (p === 'too-big') return setMsg({ text: 'รูปใหญ่เกินไป ลองรูปอื่น', ok: false });
    const { error } = await neon.from('profile_avatars').upsert({ user_id: profile.id, mime: p.mime, data: toByteaParam(p.b64) }, { onConflict: 'user_id' });
    if (error) return setMsg({ text: friendly(error), ok: false });
    await refreshAvatar(profile.id); setMsg({ text: 'เปลี่ยนรูปโปรไฟล์แล้ว', ok: true });
  }

  async function removePhoto() {
    if (!profile) return;
    const { error } = await neon.from('profile_avatars').delete().eq('user_id', profile.id);
    if (error) return setMsg({ text: friendly(error), ok: false });
    await refreshAvatar(profile.id);
  }

  async function share() {
    const r = await shareVCard(vcf, f.name || 'contact');
    if (r === 'downloaded') setMsg({ text: 'บันทึกไฟล์นามบัตร (.vcf) แล้ว — เปิดไฟล์เพื่อเพิ่มลงในรายชื่อ หรือส่งต่อผ่าน Quick Share / AirDrop', ok: true });
  }

  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar size={72} />
          <View style={{ flex: 1, gap: 6 }}>
            <Button title="เปลี่ยนรูปโปรไฟล์" variant="ghost" icon="camera" onPress={() => void photo()} />
            {avatar ? <Button title="ลบรูป" variant="ghost" onPress={() => void removePhoto()} /> : null}
          </View>
        </View>
        <Field label="ชื่อ-นามสกุล" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Field label="เบอร์โทร" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
        <Field label="ตำแหน่ง" value={f.position} onChangeText={(v) => setF({ ...f, position: v })} />
        <Field label="แผนก" value={f.department} onChangeText={(v) => setF({ ...f, department: v })} />
        <Field label="LINE ID" value={f.line} onChangeText={(v) => setF({ ...f, line: v })} />
        <Field label="เว็บไซต์" value={f.website} onChangeText={(v) => setF({ ...f, website: v })} />
        <Body tone="muted">อีเมล: {profile?.email}</Body>
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 8 }}>นามบัตรอิเล็กทรอนิกส์</Text>
        <Body tone="muted">สีนามบัตร</Body>
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 8 }}>
          {(Object.keys(CARD_THEMES) as CardTheme[]).map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={THEME_LABEL[k]} onPress={() => setF({ ...f, theme: k })}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: CARD_THEMES[k], alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: f.theme === k ? colors.text : 'transparent' }}>
              {f.theme === k ? <Icon name="check" size={18} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>
        <Chips value={f.showPhoto} options={[{ v: 'y', label: 'แสดงรูปโปรไฟล์' }, { v: 'n', label: 'ไม่แสดงรูป' }]} onPick={(v) => setF({ ...f, showPhoto: v })} />
        <Chips value={f.showLogo} options={[{ v: 'y', label: 'แสดงโลโก้บริษัท' }, { v: 'n', label: 'ไม่แสดงโลโก้' }]} onPick={(v) => setF({ ...f, showLogo: v })} />
        <View style={{ marginVertical: 12 }}>
          <BusinessCard c={{ name: f.name, position: f.position, department: f.department, phone: f.phone, email: profile?.email ?? '', website: f.website, lineId: f.line, company, theme: f.theme,
            photoUri: f.showPhoto === 'y' ? avatar : null, logoUri: f.showLogo === 'y' ? logo : null }} vcf={qrVcf} />
        </View>
        <Button title="แชร์นามบัตร (Quick Share / AirDrop)" icon="share" onPress={() => void share()} />
        <Body tone="muted">กดแชร์แล้วเลือก Quick Share (Android) หรือ AirDrop (iPhone) หรือให้อีกฝ่ายสแกน QR บนนามบัตรเพื่อบันทึกลงรายชื่อ</Body>
      </Card>
      {msg ? <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body> : null}
      <Button title="บันทึกข้อมูลส่วนตัวและนามบัตร" busy={busy} onPress={() => void save()} />
    </View>
  );
}
