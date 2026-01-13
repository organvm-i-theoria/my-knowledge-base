# User Guide

## Getting Started
```bash
npm install
npm run dev
```

## Ingesting Data
- Export from Claude: `npm run export:dev`.
- Add markdown to `raw/` and run `npm run export-incremental`.

## Searching
- CLI: `npm run search "query"`
- Semantic: `npm run search:semantic "query"`
- Hybrid: `npm run search:hybrid "query"`

## Intelligence Features
- Extract insights: `npm run extract-insights all --save`
- Smart tags: `npm run smart-tag --save`
- Relationships: `npm run find-relationships --save`

## Exporting
- Obsidian export: `npm run export-obsidian`

## References
- `README.md`
- `docs/API_DOCUMENTATION.md`
