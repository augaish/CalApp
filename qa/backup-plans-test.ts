// The account backup carries saved schedules and the other plans; a backup
// written before they were added leaves the phone's own copies alone.
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
};
const { useAppStore } = await import('/home/user/CalApp/src/lib/store.ts');

let fails = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fails++; };
const s = useAppStore.getState();
const base = { profile: null, targets: null, meals: [], exercises: [], schedule: {}, skips: {}, dayOrder: {}, workouts: [], water: [], weights: [], activeProgram: null };
useAppStore.setState({
  savedSchedules: [{ id: 'local', name: 'Mine', days: {}, createdAt: 'x', activatedAt: 'x' }] as never,
  activeScheduleId: 'local',
  recipes: [{ id: 'r1' }] as never,
});
s.applySnapshot(base as never);
let st = useAppStore.getState();
check('an older backup (no plans in it) keeps the phone\'s saved schedules', st.savedSchedules.length === 1 && st.savedSchedules[0].id === 'local' && st.activeScheduleId === 'local');
check('…and the phone\'s own recipes', st.recipes.length === 1);
s.applySnapshot({ ...base, savedSchedules: [{ id: 'cloud', name: 'Cloud', days: {}, createdAt: 'y', activatedAt: 'y' }], activeScheduleId: 'cloud', occurrences: { o1: {} } } as never);
st = useAppStore.getState();
check('a new backup restores saved schedules and which one is active', st.savedSchedules[0].id === 'cloud' && st.activeScheduleId === 'cloud');
check('…and moved sessions', Object.keys(st.occurrences).includes('o1'));
check('a field the backup lacks is still left alone', st.recipes.length === 1);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
