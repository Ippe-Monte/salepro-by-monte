import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/auth/roles';
import { Body, Card, Screen, Title } from '@/ui/kit';

// SE-M1 placeholder: real KPIs arrive in SE-M7 once the modules exist.
const MODULES = ['ลูกค้าและที่อยู่ (SE-M2)', 'สินค้าและ Stock (SE-M3)', 'แผนเข้าพบลูกค้า (SE-M4)', 'Job Ticket และ Quotation (SE-M5)', 'DO และแผนจัดส่ง (SE-M6)'];

export default function Dashboard() {
  const { profile, current } = useAuth();
  return (
    <Screen>
      <Title>{current?.org.name}</Title>
      <Card>
        <Body>สวัสดี {profile?.display_name || profile?.email}</Body>
        <Body tone="muted">บทบาทในบริษัทนี้: {current ? ROLE_LABEL[current.role] : ''}</Body>
      </Card>
      <Card>
        <Body>โมดูลที่กำลังจะมา</Body>
        {MODULES.map((m) => <Body key={m} tone="muted">• {m}</Body>)}
      </Card>
    </Screen>
  );
}
