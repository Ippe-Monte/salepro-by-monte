import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { friendly } from '@/lib/errors';
import { toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage } from '@/lib/pickImage';
import { buildVCard } from '@/lib/vcard';
import { Avatar, refreshAvatar, useAvatarUri } from './Avatar';
import { BusinessCard, type CardTemplate } from './BusinessCard';
import { CardTemplates, toTemplate, type TemplateRow } from './CardTemplates';
import { CARD_PALETTE, LEGACY_THEME_COLOR, normalizeHex } from '@/lib/cardcolor';
import { Icon } from './Icon';
import { Body, Button, Card, Chips, Field } from './kit';
import { useOrgLogoUri } from './OrgLogo';
import { Text } from './Text';
import { colors } from './theme';

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
  const canAdmin = current?.role === 'owner' || current?.role === 'admin';
  const avatar = useAvatarUri();
  const logo = useOrgLogoUri();
  const [f, setF] = useState({ name: '', phone: '', position: '', department: '', line: '', website: '', color: '#1d4ed8', hex: '#1d4ed8', templateId: null as string | null, showLogo: 'y', showPhoto: 'y' });
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [draftTpl, setDraftTpl] = useState<CardTemplate | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const col = profile.card_color ?? LEGACY_THEME_COLOR[profile.card_theme ?? 'blue'];
    setF({ name: profile.display_name ?? '', phone: profile.phone ?? '', position: profile.position ?? '', department: profile.department ?? '', line: profile.line_id ?? '', website: profile.website ?? '',
      color: col, hex: col, templateId: profile.card_template_id ?? null, showLogo: profile.card_show_logo === false ? 'n' : 'y', showPhoto: profile.card_show_photo === false ? 'n' : 'y' });
  }, [profile]);

  useEffect(() => {
    if (!f.templateId) { setTpl(null); return; }
    if (tpl?.id === f.templateId) return;
    let live = true;
    void neon.from('card_templates').select('id,name,mime,data,text_color,text_pos,panel,created_by').eq('id', f.templateId).maybeSingle().then(({ data }) => { if (live) setTpl((data as TemplateRow | null) ?? null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.templateId]);

  const company = current?.org.name ?? '';
  const vcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, department: f.department, phone: f.phone, email: profile?.email, website: f.website, lineId: f.line, address: current?.org.address }), [f, company, profile?.email, current?.org.address]);

  // The QR carries a compact card (no address) so it stays easy to scan; the shared .vcf file has everything.
  const qrVcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, phone: f.phone, email: profile?.email, lineId: f.line }), [f.name, company, f.position, f.phone, f.line, profile?.email]);

  const cardEl = (
    <BusinessCard c={{ name: f.name, position: f.position, department: f.department, phone: f.phone, email: profile?.email ?? '', website: f.website, lineId: f.line, company, color: f.color,
      template: draftTpl ?? (f.templateId ? toTemplate(tpl) : null), photoUri: f.showPhoto === 'y' ? avatar : null, logoUri: f.showLogo === 'y' ? logo : null }} vcf={qrVcf} />
  );

  async function save() {
    if (!profile || busy) return;
    if (!f.name.trim()) return setMsg({ text: 'กรอกชื่อ', ok: false });
    setBusy(true);
    const { error } = await neon.from('profiles').update({
      display_name: f.name.trim(), phone: f.phone.trim() || null, position: f.position.trim() || null, department: f.department.trim() || null,
      line_id: f.line.trim() || null, website: f.website.trim() || null, card_color: f.color, card_template_id: f.templateId, card_show_logo: f.showLogo === 'y', card_show_photo: f.showPhoto === 'y',
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
    if (typeof p === 'string') return setMsg({ text: 'รูปใหญ่เกินไป ลองรูปอื่น', ok: false });
    // No upsert: ON CONFLICT DO UPDATE needs UPDATE rights on user_id, which the table (correctly) does not grant.
    const found = await neon.from('profile_avatars').select('user_id').eq('user_id', profile.id).maybeSingle();
    if (found.error) return setMsg({ text: friendly(found.error), ok: false });
    const row = { mime: p.mime, data: toByteaParam(p.b64) };
    const { error } = found.data
      ? await neon.from('profile_avatars').update(row).eq('user_id', profile.id)
      : await neon.from('profile_avatars').insert({ user_id: profile.id, ...row });
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
        <Body tone="muted">สีนามบัตร (เลือกได้ทุกเฉด)</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
          {CARD_PALETTE.map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={k} onPress={() => setF({ ...f, color: k, hex: k })}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: k, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: f.color === k ? colors.primary : '#cbd5e1' }}>
              {f.color === k ? <Icon name="check" size={16} color={k === '#ffffff' || k === '#f1f5f9' ? '#0f172a' : '#fff'} /> : null}
            </Pressable>
          ))}
        </View>
        <Field label="รหัสสี (เช่น #1D4ED8)" value={f.hex} autoCapitalize="characters" onChangeText={(v) => { const n = normalizeHex(v); setF({ ...f, hex: v, color: n ?? f.color }); }} />
        <Chips value={f.showPhoto} options={[{ v: 'y', label: 'แสดงรูปโปรไฟล์' }, { v: 'n', label: 'ไม่แสดงรูป' }]} onPick={(v) => setF({ ...f, showPhoto: v })} />
        <Chips value={f.showLogo} options={[{ v: 'y', label: 'แสดงโลโก้บริษัท' }, { v: 'n', label: 'ไม่แสดงโลโก้' }]} onPick={(v) => setF({ ...f, showLogo: v })} />
        <View style={{ marginVertical: 12 }}>{cardEl}</View>
        {current && profile ? (
          <CardTemplates orgId={current.org_id} userId={profile.id} canDeleteAll={canAdmin} selected={f.templateId}
            onSelect={(id, row) => { setTpl(row); setF((x) => ({ ...x, templateId: id })); }} onDraft={setDraftTpl} preview={cardEl} />
        ) : null}
        <Button title="แชร์นามบัตร (Quick Share / AirDrop)" icon="share" onPress={() => void share()} />
        <Body tone="muted">กดแชร์แล้วเลือก Quick Share (Android) หรือ AirDrop (iPhone) หรือให้อีกฝ่ายสแกน QR บนนามบัตรเพื่อบันทึกลงรายชื่อ</Body>
      </Card>
      {msg ? <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body> : null}
      <Button title="บันทึกข้อมูลส่วนตัวและนามบัตร" busy={busy} onPress={() => void save()} />
    </View>
  );
}
