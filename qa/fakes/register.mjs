// Preload for app-logic tests (see loader.mjs): a localStorage for the
// persisted store, and src/lib's './supabase' and './api' pointed at fakes —
// for ES imports (the hook) and CommonJS requires (tsx compiles src to CJS).
import Module, { register } from 'node:module';
import { fileURLToPath } from 'node:url';

globalThis.window ??= globalThis;
const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: (k) => void mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };

register('./loader.mjs', import.meta.url);

const fakes = {
  './supabase': fileURLToPath(new URL('./supabase-fake.ts', import.meta.url)),
  './api': fileURLToPath(new URL('./api-fake.ts', import.meta.url)),
};
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (fakes[request] && parent?.filename?.includes('/src/lib/')) return fakes[request];
  return original.call(this, request, parent, ...rest);
};
