import Database from 'better-sqlite3';
import { AppError } from '../logger.js';
import { FederatedSearchItem } from './types.js';

type SearchRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  path: string;
  title: string;
  content: string;
  indexedAt: string;
  modifiedAt: string | null;
  mimeType: string | null;
};

function buildSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  if (normalizedContent.length === 0) return '';
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return normalizedContent.slice(0, 200);

  const index = normalizedContent.toLowerCase().indexOf(normalizedQuery);
  if (index < 0) return normalizedContent.slice(0, 200);

  const windowRadius = 90;
  const start = Math.max(0, index - windowRadius);
  const end = Math.min(normalizedContent.length, index + normalizedQuery.length + windowRadius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

export class FederatedSearchService {
  constructor(private readonly db: Database.Database) {}

  search(
    query: string,
    options: { sourceId?: string; limit?: number; offset?: number } = {}
  ): { items: FederatedSearchItem[]; total: number } {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new AppError('Search query is required', 'MISSING_QUERY', 400);
    }

    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);
    const pattern = `%${trimmed}%`;

    const whereParts = ['(d.title LIKE ? OR d.content LIKE ? OR d.path LIKE ?)'];
    const whereParams: unknown[] = [pattern, pattern, pattern];

    if (options.sourceId) {
      whereParts.push('d.source_id = ?');
      whereParams.push(options.sourceId);
    }

    const whereClause = whereParts.join(' AND ');
    const total = (
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM federated_documents d
          WHERE ${whereClause}
          `
        )
        .get(...whereParams) as { count: number }
    ).count;

    const rows = this.db
      .prepare(
        `
        SELECT
          d.id,
          d.source_id AS sourceId,
          s.name AS sourceName,
          d.path,
          d.title,
          d.content,
          d.indexed_at AS indexedAt,
          d.modified_at AS modifiedAt,
          d.mime_type AS mimeType
        FROM federated_documents d
        JOIN federated_sources s ON s.id = d.source_id
        WHERE ${whereClause}
        ORDER BY d.indexed_at DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...whereParams, limit, offset) as SearchRow[];

    const items = rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      path: row.path,
      title: row.title,
      snippet: buildSnippet(row.content, trimmed),
      mimeType: row.mimeType,
      modifiedAt: row.modifiedAt,
      indexedAt: row.indexedAt,
    }));

    return { items, total };
  }
}
