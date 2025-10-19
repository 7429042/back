export const PARENT_CATEGORIES = {
  PO: {
    name: 'Профессиональное обучение',
    slug: 'professionalnoe-obuchenie',
  },
  PP: {
    name: 'Профессиональная переподготовка',
    slug: 'professionalnaya-perepodgotovka',
  },
  PK: {
    name: 'Повышение квалификации',
    slug: 'povyshenie-kvalifikacii',
  },
} as const;

export const PARENT_CATEGORIES_LIST = Object.values(PARENT_CATEGORIES);
export const PARENT_CATEGORIES_ORDER = PARENT_CATEGORIES_LIST.map(
  (p) => p.slug,
);
