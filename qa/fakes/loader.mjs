// Node module hook for app-logic tests: src/lib's './supabase' and './api'
// resolve to in-memory fakes, so sync/account code runs without React
// Native or a network. Use: tsx --import ./qa/fakes/register.mjs <test>
export async function resolve(specifier, context, next) {
  const fromLib = context.parentURL && context.parentURL.includes('/src/lib/');
  if (fromLib && (specifier === './supabase' || specifier === './api')) {
    const name = specifier === './supabase' ? 'supabase-fake.ts' : 'api-fake.ts';
    return { url: new URL(`./${name}`, import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
