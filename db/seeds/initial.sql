PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO tags (name) VALUES
  ('web-ui'),
  ('filters'),
  ('admin-dashboard'),
  ('phase-4');

INSERT OR IGNORE INTO conversations (id, title, created, url, exported_at)
VALUES ('conv-001', 'Phase 4 Planning', datetime('now'), 'https://notes.example.com/phase4', datetime('now'));

INSERT OR IGNORE INTO documents (id, title, content, created, modified, url, format, metadata, exported_at)
VALUES ('doc-001', 'UI Design', 'Layout and visuals for the new dashboard', datetime('now'), datetime('now'), null, 'markdown', '{"owner":"team"}', datetime('now'));

INSERT OR IGNORE INTO atomic_units (
  id, type, created, timestamp, title, content, context, conversation_id,
  document_id, category, section_type, hierarchy_level, parent_section_id, tags, keywords, embedding
)
VALUES
  (
    'unit-parent',
    'design',
    datetime('now'),
    datetime('now'),
    'Phase 4 Overview',
    'Explain the roadmap for Phase 4 UI, admin views, and filters.',
    'Phase 4 design notes',
    'conv-001',
    'doc-001',
    'design',
    'chapter',
    1,
    NULL,
    '["web-ui","phase-4","admin-dashboard"]',
    '["design","roadmap"]',
    NULL
  ),
  (
    'unit-child',
    'implementation',
    datetime('now'),
    datetime('now'),
    'Filters & Tags',
    'Document how filters, tags, and dashboards connect to the API.',
    'Implementation notes',
    'conv-001',
    'doc-001',
    'implementation',
    'section',
    2,
    'unit-parent',
    '["filters","tags"]',
    '["filtering","tags"]',
    NULL
  );

INSERT OR IGNORE INTO unit_relationships (from_unit, to_unit, relationship_type)
VALUES ('unit-parent', 'unit-child', 'expands-on');

INSERT OR IGNORE INTO unit_tags (unit_id, tag_id)
SELECT 'unit-parent', id FROM tags WHERE name IN ('web-ui', 'phase-4', 'admin-dashboard');

INSERT OR IGNORE INTO unit_tags (unit_id, tag_id)
SELECT 'unit-child', id FROM tags WHERE name IN ('filters', 'web-ui');

INSERT OR IGNORE INTO keywords (keyword) VALUES ('filters'), ('tags');

INSERT OR IGNORE INTO unit_keywords (unit_id, keyword_id)
SELECT 'unit-child', id FROM keywords WHERE keyword IN ('filters', 'tags');

INSERT OR IGNORE INTO search_queries (
  id, query, normalized_query, search_type, timestamp, latency_ms, result_count, user_session, filters
)
VALUES (
  'query-phase4',
  'phase 4 filters',
  'phase 4 filters',
  'fts',
  datetime('now'),
  24,
  5,
  'session-123',
  '{"category":"design","tag":"filters"}'
);
