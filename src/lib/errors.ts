/** Map database error text to a Thai user message. Never show raw SQL errors. */
export function friendly(e: { message?: string; code?: string } | null | undefined): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.code === '23P01' || m.includes('exclusion constraint')) return 'ช่วงเวลานี้ผู้รับผิดชอบคนเดียวกันมีนัดอื่นอยู่แล้ว';
  if (m.includes('not an active member')) return 'ผู้รับผิดชอบต้องเป็นสมาชิกที่ใช้งานอยู่ของบริษัทนี้';
  if (m.includes('insufficient stock')) return 'สต็อกไม่พอ';
  if (m.includes('invalid status')) return 'สถานะเอกสารไม่อนุญาตให้ทำรายการนี้';
  if (m.includes('quotation incomplete')) return 'ต้องมีรายการสินค้า และส่วนลดต้องไม่เกินยอดรวม ก่อนส่งใบเสนอราคา';
  if (m.includes('delivery order empty')) return 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ';
  if (m.includes('document is locked')) return 'เอกสารนี้ถูกล็อกแล้ว แก้ไขไม่ได้';
  if (m.includes('invalid invitation')) return 'โค้ดเชิญไม่ถูกต้อง หมดอายุ หรืออีเมลที่ล็อกอินไม่ตรงกับที่ถูกเชิญ';
  if (m.includes('organization limit')) return 'สร้างบริษัทได้สูงสุด 5 บริษัทต่อผู้ใช้';
  if (m.includes('last active owner')) return 'ต้องมีเจ้าของที่ใช้งานอยู่อย่างน้อย 1 คน — ส่งมอบความเป็นเจ้าของให้คนอื่นก่อน';
  if (m.includes('delivery order not dispatched')) return 'ออกใบส่งของได้เมื่อ DO ออกจัดส่งแล้วเท่านั้น';
  if (m.includes('quotation not accepted')) return 'ออกอินวอยซ์ได้เฉพาะใบเสนอราคาที่ลูกค้าตกลงแล้ว';
  if (m.includes('invoice already issued')) return 'ใบเสนอราคานี้มีอินวอยซ์อยู่แล้ว';
  if (m.includes('receiver name required')) return 'กรอกชื่อผู้รับของ';
  if (m.includes('prefix already used')) return 'รหัสนำหน้านี้ถูกใช้กับเอกสารประเภทอื่นแล้ว';
  if (m.includes('forbidden') || m.includes('permission denied')) return 'ไม่มีสิทธิ์ทำรายการนี้';
  if (m.includes('invalid email')) return 'อีเมลไม่ถูกต้อง';
  return 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
}
