import { useAuth } from '@/auth/AuthProvider';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

export default function Pending() {
  const { gate, profile, signOut, refresh } = useAuth();
  const disabled = gate === 'disabled';
  return (
    <Screen>
      <Title>{disabled ? 'บัญชีถูกปิดใช้งาน' : 'รอผู้ดูแลอนุมัติ'}</Title>
      <Card>
        <Body>{disabled ? 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' : 'ลงทะเบียนสำเร็จ ผู้ดูแลระบบต้องอนุมัติและกำหนดสิทธิ์ก่อนจึงจะใช้งานได้'}</Body>
        {profile && <Body tone="muted">{profile.email}</Body>}
      </Card>
      {!disabled && <Button title="ตรวจสอบสถานะอีกครั้ง" onPress={() => void refresh()} />}
      <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
