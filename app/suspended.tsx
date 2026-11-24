import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

export default function Suspended() {
  const { signOut, refresh } = useAuth();
  const router = useRouter();
  return (
    <Screen>
      <Title>บริษัทถูกระงับการใช้งาน</Title>
      <Card><Body>บริษัทของคุณถูกระงับชั่วคราว กรุณาติดต่อผู้ดูแลระบบ SalePro</Body></Card>
      <Button title="ตรวจสอบสถานะอีกครั้ง" onPress={() => void refresh()} />
      <Button title="สร้าง/เข้าร่วมบริษัทอื่น" variant="ghost" onPress={() => router.push('/onboarding')} />
      <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
