export const ALLOWED_CATEGORIES = [
  'programming',
  'writing',
  'research',
  'design',
  'devops',
  'data',
  'general',
] as const;

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, AllowedCategory> = {
  technical: 'programming',
  tooling: 'programming',
  'best-practice': 'programming',
  bestpractice: 'programming',
  performance: 'programming',
  security: 'programming',
  architectural: 'design',
  architecture: 'design',
  decision: 'design',
  infra: 'devops',
  infrastructure: 'devops',
  operations: 'devops',
  analytics: 'data',
  database: 'data',
  databases: 'data',
  uncategorized: 'general',
  other: 'general',
};

export function normalizeCategory(input?: string | null): AllowedCategory {
  if (!input) return 'general';
  const raw = input.trim().toLowerCase();
  if (!raw) return 'general';

  if ((ALLOWED_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as AllowedCategory;
  }

  if (CATEGORY_ALIASES[raw]) {
    return CATEGORY_ALIASES[raw];
  }

  // Map multi-word categories to best known alias
  const simplified = raw.replace(/\s+/g, '-');
  if ((ALLOWED_CATEGORIES as readonly string[]).includes(simplified)) {
    return simplified as AllowedCategory;
  }
  if (CATEGORY_ALIASES[simplified]) {
    return CATEGORY_ALIASES[simplified];
  }

  return 'general';
}

export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeKeywords(keywords: string[]): string[] {
  const byLower = new Map<string, string>();
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length <= 2) continue;
    const lower = trimmed.toLowerCase();
    if (!byLower.has(lower)) {
      byLower.set(lower, trimmed);
    }
  }
  return Array.from(byLower.values());
}
