import { useEffect, useMemo, useState } from 'react';
import { neon } from '@/lib/neon';

export type OrgMember = { user_id: string; name: string; email: string; role: string };

/** Active members of the company (every member can read them), plus a helper to turn a user id into a name. */
export function useOrgMembers(orgId: string | undefined) {
  const [list, setList] = useState<OrgMember[]>([]);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    void neon.from('memberships').select('user_id,role,profiles(display_name,email)').eq('org_id', orgId).eq('status', 'active').then(({ data }) => {
      if (!live || !data) return;
      setList((data as unknown as { user_id: string; role: string; profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null }[]).map((r) => {
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        return { user_id: r.user_id, role: r.role, email: p?.email ?? '', name: p?.display_name || p?.email || '-' };
      }));
    });
    return () => { live = false; };
  }, [orgId]);
  const nameOf = useMemo(() => {
    const m = new Map(list.map((x) => [x.user_id, x.name]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? '-' : '-');
  }, [list]);
  return { members: list, nameOf };
}
