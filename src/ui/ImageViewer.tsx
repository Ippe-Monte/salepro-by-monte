import { Image, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';

/** Full-screen image viewer: tap anywhere (or the close button) to close. */
export function ImageViewer({ uri, onClose, onReplace }: { uri: string | null; onClose: () => void; onReplace?: () => void }) {
  const { width, height } = useWindowDimensions();
  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="ปิดรูป" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri }} style={{ width: width - 24, height: height * 0.72 }} resizeMode="contain" />
        <View style={{ position: 'absolute', top: 40, right: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22 }}>✕</Text>
          </View>
        </View>
        {onReplace ? (
          <Pressable accessibilityRole="button" onPress={() => { onClose(); onReplace(); }} style={{ position: 'absolute', bottom: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>เปลี่ยนรูปนี้</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}
