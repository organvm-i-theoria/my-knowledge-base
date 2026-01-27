# 🗺️ Phase 5 & 6: Comprehensive Implementation Plan

**Status:** Draft / Active
**Date:** Jan 26, 2026
**Objective:** Complete the transition to a Federated Knowledge Operating System and enable intelligent synthesis.

---

## 🏗️ Phase 5: Federated Ingestion (Current Focus)

The goal is to index knowledge *where it lives* (Zero-Copy) rather than importing it all into a monolithic database.

### 5.1. File System Integration (✅ Partially Complete)
- [x] **Local File Source:** Scan and index local/network paths.
- [x] **PDF Support:** Extract text from PDFs using `pdf-parse`.
- [x] **Real-Time Watcher:** `chokidar` integration for live updates.
- [ ] **Robustness:** Handle file locks, permissions errors, and rapid changes (debounce).
    - *Action:* Add `p-retry` and debounce logic to `watch.ts`.

### 5.2. Apple Ecosystem Integration (High Priority)
- [ ] **Apple Notes Adapter:**
    - *Strategy:* Use JXA (JavaScript for Automation) to export notes to JSON/HTML stream.
    - *Implementation:* Create `scripts/export-apple-notes.js` (JXA) and `AppleNotesSource` to consume it.
- [ ] **Browser Bookmarks:**
    - *Strategy:* Parse `~/Library/Application Support/Google/Chrome/Default/Bookmarks` and Safari equivalent.
    - *Implementation:* `BrowserSource` that reads these JSON/Plist files.

### 5.3. Semantic Search Verification
- [ ] **Generic Document Vectorization:**
    - Ensure `EmbeddingsService` handles `KnowledgeDocument` (PDF/Markdown) text correctly.
    - Verify that `AtomicUnit` created from documents properly inherits metadata.
- [ ] **Hybrid Search Tuning:**
    - Test if "Reciprocal Rank Fusion" needs weighting adjustments for Documents vs. Chats.

---

## 🧠 Phase 6: Intelligence & Granularity

Once data is flowing, we need to make it useful.

### 6.1. Smart Chunking (The "Context" Problem)
Currently, 1 File = 1 Atomic Unit. This is bad for large PDFs (e.g., a 100-page manual).
- [x] **Sliding Window / Semantic Chunking:**
    - [x] Implement a `ChunkingStrategy` interface.
    - [x] **Markdown/Text:** Split by Headers (# H1, ## H2).
    - [x] **PDF:** Split by page groups or token windows (e.g., 500 tokens with 50 overlap).
- [x] **Refinement:** Update `KnowledgeAtomizer` to support multiple strategies.

### 6.2. Multimedia Intelligence
- [x] **Image Handling:**
    - [x] Detect images in Markdown/HTML.
    - [ ] *Future:* Use `gpt-4o` or `claude-3.5-sonnet` (Vision) to generate alt-text/captions for indexing.

### 6.3. Auto-Tagging & Taxonomy
- [x] **Taxonomy Alignment:**
    - [x] Ensure tags generated for Documents match the taxonomy used for Chats.
- [x] **Bulk Tagging:**
    - [x] Create a CLI tool to backfill tags for the newly ingested Dropbox/Local files (`npm run smart-tag:backfill`).

---

## 🖥️ Phase 7: User Experience

### 7.1. Unified Search CLI
- [ ] **Filters:** Support `--source`, `--type`, `--date`.
- [ ] **Rich Output:** Show file path, snippet, and "Open" command for results.

### 7.2. Web Dashboard (Experimental)
- [ ] **Live Stats:** Visualization of indexed counts by Source.
- [ ] **Search Interface:** Web-based Hybrid Search.

---

## 🛡️ Operational Hardening

- [ ] **Unit Tests:**
    - Add tests for `LocalFileSource` (mocking `fs`).
    - Add tests for `PDF` parsing edge cases.
- [ ] **Error Boundaries:** Ensure a single corrupt file doesn't crash the `watch` process.
