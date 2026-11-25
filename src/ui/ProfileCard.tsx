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
import { CardCanvas, type CardData } from './CardCanvas';
import { CardDesigner } from './CardDesigner';
import { defaultLayout, sanitize, type Layout } from '@/lib/cardlayout';
import { DetailRows, EditActions } from './ViewEdit';
import { CardTemplates, toTemplate, type TemplateRow } from './CardTemplates';
import { CARD_PALETTE, LEGACY_THEME_COLOR, normalizeHex } from '@/lib/cardcolor';
import { Icon } from './Icon';
import { Body, Button, Card, Chips, Field } from './kit';
import { useOrgLogoUri } from './OrgLogo';
import { Text } from './Text';
import { colors } from './theme';

/** Shares the card. One attempt per tap (a failed share uses up the browser's "user gesture"):
 *  mode 'file' = the .vcf file, 'text' = the vCard as plain text, 'download' = save the .vcf file. */
export async function shareVCard(vcf: string, name: string, mode: 'file' | 'text' | 'download' = 'file'): Promise<{ result: 'shared' | 'downloaded' | 'cancelled' | 'failed'; why?: string }> {
  if (Platform.OS !== 'web') {
    try { await Share.share({ message: vcf }); return { result: 'shared' }; } catch { return { result: 'cancelled' }; }
  }
  // ASCII file name: some Android share targets (Quick Share) reject names with Thai characters
  const base = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'contact';
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([vcf], `${base}.vcf`, { type: 'text/vcard' });
  if (mode === 'download' || typeof nav.share !== 'function') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    return { result: 'downloaded', why: typeof nav.share === 'function' ? undefined : 'share not supported' };
  }
  try {
    if (mode === 'file') {
      if (!nav.canShare?.({ files: [file] })) return { result: 'failed', why: 'file not shareable' };
      await nav.share({ files: [file] });
    } else {
      await nav.share({ text: vcf });
    }
    return { result: 'shared' };
  } catch (e) {
    const n = (e as Error)?.name;
    return n === 'AbortError' ? { result: 'cancelled' } : { result: 'failed', why: `${mode}: ${n}` };
  }
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
  const [editP, setEditP] = useState(false);
  const [editC, setEditC] = useState(false);
  const [savedP, setSavedP] = useState(false);
  const [savedC, setSavedC] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [overwrite, setOverwrite] = useState(true); // saving a changed saved format: overwrite it (same name) or save as a new one

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

  useEffect(() => {
    const id = profile?.card_layout_id ?? null;
    setLayoutId(id); setDirty(false);
    if (!id) { setLayout(null); return; }
    let live = true;
    void neon.from('card_layouts').select('layout').eq('id', id).maybeSingle().then(({ data }) => { if (live) setLayout(data ? sanitize((data as { layout: unknown }).layout) : null); });
    return () => { live = false; };
  }, [profile?.card_layout_id]);

  const company = current?.org.name ?? '';
  const vcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, department: f.department, phone: f.phone, email: profile?.email, website: f.website, lineId: f.line, address: current?.org.address }), [f, company, profile?.email, current?.org.address]);

  // The QR carries a compact card (no address) so it stays easy to scan; the shared .vcf file has everything.
  const qrVcf = useMemo(() => buildVCard({ name: f.name, company, position: f.position, phone: f.phone, email: profile?.email, lineId: f.line }), [f.name, company, f.position, f.phone, f.line, profile?.email]);

  const cardData: CardData = { name: f.name, position: f.position, department: f.department, company, address: current?.org.address ?? '', phone: f.phone, email: profile?.email ?? '', line: f.line, website: f.website,
    logoUri: f.showLogo === 'y' ? logo : null, photoUri: f.showPhoto === 'y' ? avatar : null };
  const tplNow = draftTpl ?? (f.templateId ? toTemplate(tpl) : null);
  const cardEl = layout ? (
    <CardCanvas layout={layout} data={cardData} vcf={qrVcf} color={f.color} template={tplNow} />
  ) : (
    <BusinessCard c={{ name: f.name, position: f.position, department: f.department, phone: f.phone, email: profile?.email ?? '', website: f.website, lineId: f.line, company, color: f.color,
      template: tplNow, photoUri: f.showPhoto === 'y' ? avatar : null, logoUri: f.showLogo === 'y' ? logo : null }} vcf={qrVcf} />
  );

  async function saveP() {
    if (!profile || busy) return;
    if (!f.name.trim()) return setMsg({ text: 'กรอกชื่อ', ok: false });
    setBusy(true);
    const { error } = await neon.from('profiles').update({
      display_name: f.name.trim(), phone: f.phone.trim() || null, position: f.position.trim() || null, department: f.department.trim() || null,
      line_id: f.line.trim() || null, website: f.website.trim() || null,
    }).eq('id', profile.id);
    setBusy(false);
    if (error) return setMsg({ text: friendly(error), ok: false });
    setMsg(null); setEditP(false); setSavedP(true);
    await refresh();
  }

  async function saveC() {
    if (!profile || !current || busy) return;
    setBusy(true);
    let id = layoutId;
    if (layout && id && dirty && overwrite) {
      const up = await neon.from('card_layouts').update({ layout }).eq('id', id).select('id');
      if (up.error || !up.data?.length) { setBusy(false); return setMsg({ text: up.error ? friendly(up.error) : 'ไม่มีสิทธิ์แก้รูปแบบนี้ (เฉพาะผู้สร้างหรือผู้ดูแล) — เลือก "บันทึกเป็นรูปแบบใหม่"', ok: false }); }
    } else if (layout && (dirty || !id)) {
      if (!layoutName.trim()) { setBusy(false); return setMsg({ text: 'ตั้งชื่อรูปแบบนามบัตร', ok: false }); }
      const ins = await neon.from('card_layouts').insert({ org_id: current.org_id, name: layoutName.trim(), layout }).select('id').single();
      if (ins.error || !ins.data) { setBusy(false); return setMsg({ text: friendly(ins.error), ok: false }); }
      id = ins.data.id as string;
    }
    const { error } = await neon.from('profiles').update({ card_color: f.color, card_template_id: f.templateId, card_show_logo: f.showLogo === 'y', card_show_photo: f.showPhoto === 'y', card_layout_id: layout ? id : null }).eq('id', profile.id);
    setBusy(false);
    if (error) return setMsg({ text: friendly(error), ok: false });
    setMsg(null); setEditC(false); setSavedC(true); setDirty(false); setLayoutName('');
    await refresh();
  }

  function startEditC() {
    setSavedC(false); setMsg(null); setLayoutName('');
    if (!layout) { setLayout(defaultLayout()); setDirty(true); }
    setEditC(true);
  }
  function cancelC() { setEditC(false); setMsg(null); setDirty(false); setLayoutId(profile?.card_layout_id ?? null); setLayoutName(''); setLayout(null); if (profile?.card_layout_id) void neon.from('card_layouts').select('layout').eq('id', profile.card_layout_id).maybeSingle().then(({ data }) => setLayout(data ? sanitize((data as { layout: unknown }).layout) : null)); }

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

  const TEXT_KEY = 'salepro.share.textOnly'; // this browser could not share the .vcf file but can share text: remember it
  const textOnly = (() => { try { return globalThis.localStorage?.getItem(TEXT_KEY) === '1'; } catch { return false; } })();
  const [shareFailed, setShareFailed] = useState(false);
  async function share(mode: 'file' | 'text' | 'download' = textOnly ? 'text' : 'file') {
    const r = await shareVCard(vcf, f.name || 'contact', mode);
    if (r.result === 'shared' && mode === 'text') { try { globalThis.localStorage?.setItem(TEXT_KEY, '1'); } catch { /* ignore */ } }
    if (r.result === 'failed') { setShareFailed(true); setMsg({ text: `เมนูแชร์ของเบราว์เซอร์ใช้ไม่ได้ (${r.why ?? ''}) ลองแชร์เป็นข้อความ หรือบันทึกไฟล์ .vcf แล้วส่งต่อจากแอปไฟล์`, ok: false }); }
    else if (r.result === 'downloaded') setMsg({ text: 'บันทึกไฟล์นามบัตร (.vcf) แล้ว — เปิดไฟล์เพื่อเพิ่มลงในรายชื่อ หรือส่งต่อผ่าน Quick Share / AirDrop', ok: true });
    else if (r.result === 'shared') { setShareFailed(false); setMsg(null); }
  }

  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar size={72} />
          {editP ? (
            <View style={{ flex: 1, gap: 6 }}>
              <Button title="เปลี่ยนรูปโปรไฟล์" variant="ghost" icon="camera" onPress={() => void photo()} />
              {avatar ? <Button title="ลบรูป" variant="ghost" onPress={() => void removePhoto()} /> : null}
            </View>
          ) : <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{f.name || '-'}</Text>}
        </View>
        {editP ? (
          <View>
            <Field label="ชื่อ-นามสกุล" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Field label="เบอร์โทร" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
            <Field label="ตำแหน่ง" value={f.position} onChangeText={(v) => setF({ ...f, position: v })} />
            <Field label="แผนก" value={f.department} onChangeText={(v) => setF({ ...f, department: v })} />
            <Field label="LINE ID" value={f.line} onChangeText={(v) => setF({ ...f, line: v })} />
            <Field label="เว็บไซต์" value={f.website} onChangeText={(v) => setF({ ...f, website: v })} />
            <Body tone="muted">อีเมล: {profile?.email}</Body>
          </View>
        ) : (
          <DetailRows rows={[['ชื่อ-นามสกุล', f.name], ['เบอร์โทร', f.phone], ['ตำแหน่ง', f.position], ['แผนก', f.department], ['LINE ID', f.line], ['เว็บไซต์', f.website], ['อีเมล', profile?.email]]} />
        )}
        <EditActions editing={editP} canEdit busy={busy} saved={savedP} onEdit={() => { setSavedP(false); setMsg(null); setEditP(true); }} onSave={() => void saveP()}
          onCancel={() => { setEditP(false); setMsg(null); if (profile) setF((x) => ({ ...x, name: profile.display_name ?? '', phone: profile.phone ?? '', position: profile.position ?? '', department: profile.department ?? '', line: profile.line_id ?? '', website: profile.website ?? '' })); }} />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 8 }}>นามบัตรอิเล็กทรอนิกส์</Text>
        {editC && current && profile ? (
          <View>
            <CardDesigner orgId={current.org_id} userId={profile.id} canDeleteAll={canAdmin} layout={layout ?? defaultLayout()} layoutId={layoutId}
              onChange={(l) => { setLayout(l); setDirty(true); }} onPickSaved={(id, l) => { setLayout(l); setLayoutId(id); setDirty(false); }}
              data={cardData} vcf={qrVcf} color={f.color} template={tplNow} />
            {dirty && layoutId ? <Chips value={overwrite ? 'o' : 'n'} options={[{ v: 'o', label: 'บันทึกทับรูปแบบเดิม (ชื่อเดิม)' }, { v: 'n', label: 'บันทึกเป็นรูปแบบใหม่' }]} onPick={(v) => setOverwrite(v === 'o')} /> : null}
            {dirty && (!layoutId || !overwrite) ? <Field label="ชื่อรูปแบบ (บันทึกให้ทั้งบริษัทใช้)" value={layoutName} onChangeText={setLayoutName} /> : null}
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
            <CardTemplates orgId={current.org_id} userId={profile.id} canDeleteAll={canAdmin} selected={f.templateId}
              onSelect={(id, row) => { setTpl(row); setF((x) => ({ ...x, templateId: id })); }} onDraft={setDraftTpl} preview={cardEl} />
          </View>
        ) : (
          <View style={{ marginVertical: 8 }}>
            {cardEl}
            {!layout ? <Body tone="muted">ยังไม่ได้ออกแบบรูปแบบนามบัตร กด "แก้ไข" เพื่อกำหนดขนาดและจัดวางข้อความ</Body> : null}
          </View>
        )}
        {msg ? <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body> : null}
        <EditActions editing={editC} canEdit busy={busy} saved={savedC} onEdit={startEditC} onSave={() => void saveC()} onCancel={cancelC} />
      </Card>
      {msg && !editC ? <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body> : null}
      {!editC && !editP ? (
        <View>
          <Button title="แชร์นามบัตร (Quick Share / AirDrop)" icon="share" onPress={() => void share()} />
          {shareFailed ? (
            <>
              <Button title="แชร์เป็นข้อความ" variant="ghost" onPress={() => void share('text')} />
              <Button title="บันทึกไฟล์ .vcf" variant="ghost" onPress={() => void share('download')} />
            </>
          ) : null}
          <Body tone="muted">กดแชร์แล้วเลือก Quick Share (Android) หรือ AirDrop (iPhone) หรือให้อีกฝ่ายสแกน QR บนนามบัตรเพื่อบันทึกลงรายชื่อ</Body>
        </View>
      ) : null}
    </View>
  );
}
