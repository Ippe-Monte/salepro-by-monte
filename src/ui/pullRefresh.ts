import { getLang } from '@/i18n';
import { colors } from '@/ui/theme';
import { translate } from '@/i18n/translate';

const tr = (t: string) => translate(t, getLang());

/** Web/PWA only: pull the page down past the top (from a scroll position of 0) and release to reload. */
export function installPullRefresh(): () => void {
  if (typeof document === 'undefined') return () => {};
  const THRESHOLD = 90;
  let startY = 0; let pulling = false; let dist = 0;
  const bar = document.createElement('div');
  Object.assign(bar.style, { position: 'fixed', top: '0', left: '50%', transform: 'translate(-50%,-60px)', zIndex: '9999', padding: '8px 16px', borderRadius: '20px', background: colors.primary, color: '#fff', fontSize: '14px', fontWeight: '700', pointerEvents: 'none', transition: 'transform .15s' });
  document.body.appendChild(bar);
  const scrollTopOf = (el: Element | null): number => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const st = getComputedStyle(n);
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n.scrollTop;
    }
    return document.scrollingElement?.scrollTop ?? 0;
  };
  const start = (e: TouchEvent) => { const t = e.touches[0]; if (!t) return; pulling = scrollTopOf(e.target as Element) <= 0; startY = t.clientY; dist = 0; };
  const move = (e: TouchEvent) => {
    if (!pulling) return; const t = e.touches[0]; if (!t) return;
    dist = t.clientY - startY;
    if (dist <= 0) { bar.style.transform = 'translate(-50%,-60px)'; return; }
    bar.textContent = dist >= THRESHOLD ? tr('ปล่อยเพื่อรีเฟรช') : tr('ดึงลงเพื่อรีเฟรช');
    bar.style.transform = `translate(-50%,${Math.min(dist, 120) - 40}px)`;
  };
  const end = () => {
    if (pulling && dist >= THRESHOLD) { bar.textContent = tr('กำลังรีเฟรช…'); window.location.reload(); return; }
    pulling = false; dist = 0; bar.style.transform = 'translate(-50%,-60px)';
  };
  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: true });
  document.addEventListener('touchend', end);
  return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); bar.remove(); };
}
