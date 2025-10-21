import slugify from '@sindresorhus/slugify';

export function normalizeSlug(input: string) {
  return slugify(input, { separator: '-', lowercase: true });
}

export function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}