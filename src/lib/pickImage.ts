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
