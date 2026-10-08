import type { Exercise, SetupField, SetupVersion } from './types';

/**
 * "My setup": how a person sets a machine up (seat 4, back pad 2, V-bar),
 * saved once per exercise and shown every time it comes up. Setups belong to
 * the exercise, never to a day, and change only when edited. They stay on
 * the phone and in the person's own backup; they are never sent to the AI.
 */

export type SetupKind = 'machine' | 'cable' | 'bench' | 'rack' | 'assisted';
export type SetupInput = 'number' | 'text' | 'choice';

/** Setting keys and how each is entered. Names live in the locales (setup.field.*). */
export const SETUP_INPUTS: Record<string, { input: SetupInput; choices?: string[] }> = {
  seat: { input: 'number' },
  backPad: { input: 'number' },
  start: { input: 'number' },
  feet: { input: 'text' },
  safety: { input: 'number' },
  pulley: { input: 'number' },
  handle: {
    input: 'choice',
    choices: ['rope', 'vBar', 'wideBar', 'straightBar', 'single', 'triangle'],
  },
  thighPad: { input: 'number' },
  angle: {
    input: 'choice',
    choices: ['flat', 'deg15', 'deg30', 'deg45', 'upright', 'decline'],
  },
  barHook: { input: 'number' },
  kneePad: { input: 'number' },
  grip: { input: 'choice', choices: ['wide', 'narrow', 'neutral'] },
  band: { input: 'text' },
  other: { input: 'text' },
};

/** The settings offered for each kind of equipment, most used first. */
export const SETUP_SUGGESTIONS: Record<SetupKind | 'general', string[]> = {
  machine: ['seat', 'backPad', 'start', 'feet', 'safety'],
  cable: ['pulley', 'handle', 'seat', 'thighPad'],
  bench: ['angle', 'seat'],
  rack: ['barHook', 'safety'],
  assisted: ['kneePad', 'grip'],
  general: ['seat', 'angle', 'handle', 'grip', 'band'],
};

const BUILTIN_KIND: Record<string, SetupKind> = {};
const put = (kind: SetupKind, ids: string[]) => ids.forEach((id) => (BUILTIN_KIND[id] = kind));
put('machine', [
  'chest-fly',
  'chest-press-machine',
  't-bar-row',
  'leg-press',
  'leg-extension',
  'leg-curl',
  'calf-raise',
  'glute-kickback',
  'abductor',
  'decline-chest-press',
  'hack-squat',
  'seated-calf-raise',
  'hip-thrust-machine',
  'glute-master',
  'machine-bent-over-row',
  'rear-delt-pec-deck',
  'calf-press-leg-press',
  'incline-chest-press-machine',
  'shoulder-press-machine',
  'shrug-machine',
  'lateral-raise-machine',
  'preacher-curl-machine',
  'tricep-extension-machine',
  'seated-leg-curl',
  'hip-adductor',
]);
put('cable', [
  'cable-crossover',
  'lat-pulldown',
  'seated-row',
  'face-pull',
  'cable-curl',
  'tricep-pushdown',
  'cable-crunch',
  'pec-fly-cable',
  'seated-row-close-grip',
  'lat-pulldown-close-grip',
  'lateral-raise-cable',
  'rear-delt-cross-cable',
  'behind-body-cable-curl',
  'pushdown-triangle',
  'reverse-curl-cable',
  'wrist-curl-cable',
]);
put('bench', ['incline-bench', 'preacher-curl', 'preacher-curl-dumbbell', 'decline-bench-press', 'seated-shoulder-press', 'incline-dumbbell-press']);
put('rack', ['bench-press', 'squat', 'close-grip-bench']);
put('assisted', ['assisted-pull-up-machine', 'assisted-dip-machine']);

/**
 * What kind of equipment an exercise uses, which decides whether the workout
 * offers "Add my setup" up front and which settings it suggests. Null for
 * body-weight, free-weight and cardio work, where there is nothing to set.
 * A scanned exercise is a machine by definition; a custom one is judged by
 * its name.
 */
export function setupKindFor(ex: Pick<Exercise, 'id' | 'name' | 'nameEn' | 'nameAr' | 'source' | 'category'> | undefined): SetupKind | null {
  if (!ex || ex.category === 'cardio') return null;
  const bare = ex.id.replace(/^builtin:/, '');
  if (ex.source === 'builtin') return BUILTIN_KIND[bare] ?? null;
  const name = [ex.name, ex.nameEn, ex.nameAr].filter(Boolean).join(' ').toLowerCase();
  if (/assist|مساعد/.test(name)) return 'assisted';
  if (/cable|pulley|كابل|بكرة/.test(name)) return 'cable';
  if (/smith|rack|سميث|رف/.test(name)) return 'rack';
  if (/machine|جهاز/.test(name)) return 'machine';
  if (ex.source === 'scan') return 'machine';
  return null;
}

/** Local calendar day as a sortable number (y-m-d keys are not). */
function dayNum(iso: string): number {
  const d = new Date(iso);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

/** Only settings that say something: a named key and a value. */
export function cleanFields(fields: SetupField[]): SetupField[] {
  const out: SetupField[] = [];
  for (const f of fields) {
    const value = f.value.trim().slice(0, 60);
    const label = f.label?.trim().slice(0, 40);
    if (!value || (f.key === 'other' && !label)) continue;
    out.push(f.key === 'other' ? { key: 'other', label, value } : { key: f.key, value });
  }
  return out;
}

export function sameFields(a: SetupField[], b: SetupField[]): boolean {
  return a.length === b.length && a.every((f, i) => f.key === b[i].key && (f.label ?? '') === (b[i].label ?? '') && f.value === b[i].value);
}

/** The setup as it stands now, or undefined when there is none. */
export function currentSetup(versions: SetupVersion[] | undefined): SetupVersion | undefined {
  const last = versions?.[versions.length - 1];
  return last && last.fields.length ? last : undefined;
}

/**
 * When the current setup was first set to what it is now: "Same since Sep 22".
 * A save that changed nothing does not count, and neither does a same-day
 * correction, which replaces that day's version.
 */
export function setupSince(versions: SetupVersion[] | undefined): string | undefined {
  return currentSetup(versions)?.at;
}

/** The setup in force on the day of `at`: the last version saved that day or before. */
export function setupOn(versions: SetupVersion[] | undefined, at: string): SetupVersion | undefined {
  if (!versions?.length) return undefined;
  const day = dayNum(at);
  let found: SetupVersion | undefined;
  for (const v of versions) if (dayNum(v.at) <= day) found = v;
  return found && found.fields.length ? found : undefined;
}

/**
 * Versions after saving `fields` at `at`. A change on the same day as the
 * last version replaces it (a correction mid-workout is not history); a save
 * that changes nothing changes nothing. Keeps the last 30 versions.
 */
export function withSetup(versions: SetupVersion[] | undefined, fields: SetupField[], at: string): SetupVersion[] | null {
  const list = versions ?? [];
  const clean = cleanFields(fields);
  const last = list[list.length - 1];
  if (last ? sameFields(last.fields, clean) : clean.length === 0) return null;
  const base = last && dayNum(last.at) === dayNum(at) ? list.slice(0, -1) : list;
  // Undoing today's change back to what it was before is no change at all.
  const before = base[base.length - 1];
  if (before ? sameFields(before.fields, clean) : clean.length === 0) return base;
  return [...base, { at, fields: clean }].slice(-30);
}

/** One changed setting between two setups: "Seat 5 → 4". `from` or `to` is absent when it was added or removed. */
export interface SetupChange {
  field: SetupField;
  from?: string;
  to?: string;
}

const fieldId = (f: SetupField) => (f.key === 'other' ? `other:${(f.label ?? '').toLowerCase()}` : f.key);

export function setupChanges(before: SetupField[], after: SetupField[]): SetupChange[] {
  const out: SetupChange[] = [];
  for (const f of after) {
    const old = before.find((b) => fieldId(b) === fieldId(f));
    if (!old) out.push({ field: f, to: f.value });
    else if (old.value !== f.value) out.push({ field: f, from: old.value, to: f.value });
  }
  for (const b of before) if (!after.some((f) => fieldId(f) === fieldId(b))) out.push({ field: b, from: b.value });
  return out;
}
