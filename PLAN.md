# 🚀 Next Steps Plan

**Date:** January 31, 2026
**Status:** Phase 4 (UI) Complete | Phase 5 (Ingestion) Verification

## 1. Immediate Actions (Verification)

### ✅ Web UI (React)
The React application has been built and is now the default UI.
- **Command:** `npm run web`
- **Verify:**
    - New "Tabbed" Interface (Search, Graph, Tags, Settings).
    - **Settings Tab:** Check if system stats and API status are green.
    - **Graph Tab:** Ensure the D3 visualization loads.

### 🍎 Apple Notes & Bookmarks
The integration code exists but requires permission verification on macOS.
- **Command:** `npm run ingest:all`
- **Note:** Watch for a macOS permission popup for "Terminal/Node" to access "Notes" or "Google Chrome".

### ☁️ iCloud Drive
Enable iCloud Documents indexing.
- **File:** `config/sources.yaml`
- **Action:** Set `enabled: true` for the `icloud-docs` entry.

## 2. Short-Term Roadmap

### 🔍 Search & Intelligence
- **Tune Hybrid Search:** Adjust weights in **Settings** based on real usage.
- **Backfill Tags:** Run `npm run smart-tag:backfill` to generate tags for the newly ingested local files and notes.

### 🛠 Operational
- **Backup:** Run `npm run backup` to create a snapshot of your `knowledge.db`.

## 3. Development
- **Monitoring:** Implement a simple "Health" check that logs to a file (as per Roadmap).
- **Unit Tests:** Add specific tests for `AppleNotesSource` output parsing (mocking the JXA output).
