import { neon } from './neon';

type Err = { message?: string; code?: string } | null;

/**
 * Save one row addressed by `keys`: update it, or insert it when it does not exist yet.
 * (Upsert is avoided because ON CONFLICT would also try to update the key columns, which are not column-granted.)
 */
export async function saveRow(table: string, keys: Record<string, string>, values: Record<string, unknown>): Promise<Err> {
  const upd = await neon.from(table).update(values).match(keys).select('*');
  if (upd.error) return upd.error;
  if (upd.data && upd.data.length > 0) return null;
  const ins = await neon.from(table).insert({ ...keys, ...values });
  return ins.error;
}
