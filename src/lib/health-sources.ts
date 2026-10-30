import type { Ionicons } from '@expo/vector-icons';

/**
 * Where every health number in the app comes from (App Store guideline
 * 1.4.1: health information needs citations the user can find). Each topic
 * says, in the strings under `sources.<id>`, what Calgym calculates and how;
 * its links are the published sources behind that method. Keep these in step
 * with the code they describe: tdee.ts (calories, protein, fat, carbs, pace,
 * the 1,200 kcal floor), store.ts (BMI, water, calories burned) and the
 * fasting screen.
 */
export interface HealthSource {
  /** The citation as shown; a paper's own name is not translated. */
  label: { en: string; ar: string };
  url: string;
}

export interface HealthTopic {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  sources: HealthSource[];
}

export interface HealthSection {
  id: 'targets' | 'health' | 'training' | 'food';
  topics: HealthTopic[];
}

const same = (s: string) => ({ en: s, ar: s });

export const HEALTH_SECTIONS: HealthSection[] = [
  {
    id: 'targets',
    topics: [
      {
        id: 'bmr',
        icon: 'flame-outline',
        sources: [
          { label: same('Mifflin et al., Am J Clin Nutr, 1990'), url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
          {
            label: { en: 'FAO/WHO/UNU · Human energy requirements', ar: 'الفاو/الصحة العالمية · احتياجات الإنسان من الطاقة' },
            url: 'https://www.fao.org/4/y5686e/y5686e00.htm',
          },
        ],
      },
      {
        id: 'pace',
        icon: 'scale-outline',
        sources: [
          { label: { en: 'NIH · Body Weight Planner', ar: 'المعاهد الوطنية للصحة · مخطط وزن الجسم' }, url: 'https://www.niddk.nih.gov/bwp' },
          { label: same('Hall et al., The Lancet, 2011'), url: 'https://pubmed.ncbi.nlm.nih.gov/21872751/' },
          {
            label: { en: 'CDC · Losing weight', ar: 'مراكز السيطرة على الأمراض · إنقاص الوزن' },
            url: 'https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html',
          },
        ],
      },
      {
        id: 'protein',
        icon: 'nutrition-outline',
        sources: [
          { label: same('Morton et al., Br J Sports Med, 2018'), url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/' },
          { label: same('Jäger et al., J Int Soc Sports Nutr, 2017'), url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/' },
          { label: same('Helms et al., Int J Sport Nutr Exerc Metab, 2014'), url: 'https://pubmed.ncbi.nlm.nih.gov/24092765/' },
        ],
      },
      {
        id: 'fatCarbs',
        icon: 'restaurant-outline',
        sources: [
          {
            label: { en: 'WHO · Healthy diet', ar: 'منظمة الصحة العالمية · النظام الغذائي الصحي' },
            url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
          },
        ],
      },
    ],
  },
  {
    id: 'health',
    topics: [
      {
        id: 'bmi',
        icon: 'body-outline',
        sources: [
          {
            label: { en: 'WHO · Obesity and overweight', ar: 'منظمة الصحة العالمية · السمنة وزيادة الوزن' },
            url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight',
          },
        ],
      },
      {
        id: 'water',
        icon: 'water-outline',
        sources: [
          {
            label: { en: 'EFSA · Dietary reference values for water', ar: 'الهيئة الأوروبية لسلامة الأغذية · القيم المرجعية للماء' },
            url: 'https://www.efsa.europa.eu/en/efsajournal/pub/1459',
          },
        ],
      },
      {
        id: 'fasting',
        icon: 'time-outline',
        sources: [{ label: same('de Cabo & Mattson, N Engl J Med, 2019'), url: 'https://pubmed.ncbi.nlm.nih.gov/31881139/' }],
      },
      { id: 'readings', icon: 'pulse-outline', sources: [] },
    ],
  },
  {
    id: 'training',
    topics: [
      {
        id: 'strength',
        icon: 'barbell-outline',
        sources: [{ label: same('ACSM position stand, Med Sci Sports Exerc, 2009'), url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/' }],
      },
      {
        id: 'activity',
        icon: 'fitness-outline',
        sources: [
          {
            label: { en: 'WHO · Physical activity guidelines, 2020', ar: 'منظمة الصحة العالمية · إرشادات النشاط البدني ٢٠٢٠' },
            url: 'https://www.who.int/publications/i/item/9789240015128',
          },
        ],
      },
      {
        id: 'burn',
        icon: 'flash-outline',
        sources: [
          { label: { en: 'Compendium of Physical Activities', ar: 'موسوعة الأنشطة البدنية (Compendium)' }, url: 'https://pacompendium.com/' },
          { label: same('Ainsworth et al., Med Sci Sports Exerc, 2011'), url: 'https://pubmed.ncbi.nlm.nih.gov/21681120/' },
        ],
      },
    ],
  },
  {
    id: 'food',
    topics: [
      {
        id: 'foodEnergy',
        icon: 'calculator-outline',
        sources: [
          {
            label: { en: 'FAO · Food energy: methods of analysis', ar: 'الفاو · طاقة الغذاء: طرق التحليل' },
            url: 'https://www.fao.org/4/y5022e/y5022e00.htm',
          },
        ],
      },
      {
        id: 'foodData',
        icon: 'barcode-outline',
        sources: [{ label: same('Open Food Facts'), url: 'https://world.openfoodfacts.org/' }],
      },
      { id: 'ai', icon: 'sparkles-outline', sources: [] },
    ],
  },
];

/** Every link on the page, for the link check. */
export function allSourceUrls(): string[] {
  return HEALTH_SECTIONS.flatMap((s) => s.topics.flatMap((t) => t.sources.map((x) => x.url)));
}
