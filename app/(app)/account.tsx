import { useAuth } from '@/auth/AuthProvider';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

export default function Account() {
  const { profile, signOut } = useAuth();
  return (
    <Screen>
      <Title>บัญชีของฉัน</Title>
      <Card>
        <Body>{profile?.display_name}</Body>
        <Body tone="muted">{profile?.email}</Body>
        <Body tone="muted">บทบาท: {profile?.role}</Body>
      </Card>
      <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
