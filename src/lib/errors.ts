/** Map database error text to a Thai user message. Never show raw SQL errors. */
export function friendly(e: { message?: string } | null | undefined): string {
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('invalid invitation')) return 'โค้ดเชิญไม่ถูกต้อง หมดอายุ หรืออีเมลที่ล็อกอินไม่ตรงกับที่ถูกเชิญ';
  if (m.includes('organization limit')) return 'สร้างบริษัทได้สูงสุด 5 บริษัทต่อผู้ใช้';
  if (m.includes('last active owner')) return 'ต้องมีเจ้าของที่ใช้งานอยู่อย่างน้อย 1 คน — ส่งมอบความเป็นเจ้าของให้คนอื่นก่อน';
  if (m.includes('forbidden') || m.includes('permission denied')) return 'ไม่มีสิทธิ์ทำรายการนี้';
  if (m.includes('invalid email')) return 'อีเมลไม่ถูกต้อง';
  return 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
}
