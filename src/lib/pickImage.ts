import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { MAX_IMAGE_BYTES, base64Bytes } from './image';

export type Picked = { b64: string; mime: 'image/png' | 'image/jpeg'; bytes: number };

/** Let the user choose a photo, shrink it to fit the database limit (300 KB) and return base64. */
export async function pickImage(opts: { maxSide: number; format: 'png' | 'jpeg' }): Promise<Picked | null | 'too-big'> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const png = opts.format === 'png';
  let side = opts.maxSide;
  let quality = 0.85;
  for (let i = 0; i < 6; i++) {
    const resize = a.width >= a.height ? { width: Math.min(side, a.width) } : { height: Math.min(side, a.height) };
    const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], {
      base64: true, compress: png ? 1 : quality,
      format: png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
    });
    const b64 = out.base64 ?? '';
    const bytes = base64Bytes(b64);
    if (bytes > 0 && bytes <= MAX_IMAGE_BYTES) return { b64, mime: png ? 'image/png' : 'image/jpeg', bytes };
    side = Math.round(side * 0.75);
    quality = Math.max(0.3, quality - 0.15);
  }
  return 'too-big';
}

export const MAX_ATTACH_BYTES = 1_800_000;

/** Read any picked file (local uri or blob url) as base64 — works on web and native. */
export async function uriToBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(blob);
  });
}

/** Take or choose a photo for an attachment: shrunk to at most 1600 px and under ~1.8 MB. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<(Picked & { name: string }) | null | 'too-big' | 'denied'> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
  }
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  let side = 1600; let quality = 0.8;
  for (let i = 0; i < 6; i++) {
    const resize = a.width >= a.height ? { width: Math.min(side, a.width) } : { height: Math.min(side, a.height) };
    const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], { base64: true, compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    const b64 = out.base64 ?? '';
    const bytes = base64Bytes(b64);
    if (bytes > 0 && bytes <= MAX_ATTACH_BYTES) return { b64, mime: 'image/jpeg', bytes, name: (a.fileName ?? `photo-${Date.now()}`).replace(/\.\w+$/, '') + '.jpg' };
    side = Math.round(side * 0.75); quality = Math.max(0.4, quality - 0.1);
  }
  return 'too-big';
}
