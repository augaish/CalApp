// In-memory stand-in for the Supabase client: one signed-in user (or none)
// and the user_data table, with a switch to make writes fail (offline).
type Row = { user_id: string; data: unknown; updated_at: string };

type Fake = { uid: string | null; rows: Map<string, Row>; offline: boolean; signOuts: number };
// Shared through globalThis: the test (ESM) and src/lib (compiled to CJS)
// each load their own copy of this module.
const g = globalThis as unknown as { __supabaseFake?: Fake };
export const fake: Fake = (g.__supabaseFake ??= { uid: null, rows: new Map(), offline: false, signOuts: 0 });

export const authConfigured = true;

export function getSupabase() {
  return {
    auth: {
      getSession: async () => ({ data: { session: fake.uid ? { user: { id: fake.uid, email: `${fake.uid}@example.com` } } : null } }),
      signOut: async () => {
        fake.signOuts++;
        fake.uid = null;
        return { error: null };
      },
    },
    from: (_table: string) => ({
      select: () => ({
        eq: (_col: string, uid: string) => ({
          maybeSingle: async () => {
            const row = fake.rows.get(uid);
            return { data: row ? { data: row.data, updated_at: row.updated_at } : null, error: null };
          },
        }),
      }),
      upsert: async (row: Row) => {
        if (fake.offline) return { error: { message: 'offline' } };
        fake.rows.set(row.user_id, JSON.parse(JSON.stringify(row)));
        return { error: null };
      },
      delete: () => ({ eq: async (_c: string, uid: string) => { fake.rows.delete(uid); return { error: null }; } }),
    }),
  };
}
