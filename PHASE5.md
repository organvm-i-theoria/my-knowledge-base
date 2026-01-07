# Phase 5: Federated Knowledge Operating System

Phase 5 transforms the system from a "Claude Archive" into a universal **Federated Knowledge Operating System**. It uses a **Zero-Copy Architecture** to index data where it lives (iCloud, Dropbox, Local Drive) without duplicating files, alongside AI chat exports.

## 🎯 Objectives

1.  **Federated Ingestion:** Index files in-place using `config/sources.yaml`.
2.  **Unified Data Model:** Abstract `Conversation` and `Document` into `AtomicUnit`.
3.  **Plugin Architecture:** `KnowledgeSource` interface for modular providers.
4.  **Multi-Modal Support:** Text, PDF, HTML, and Chat Logs.

## ✅ Completed Milestones

- [x] **Core Architecture:**
    - [x] Renamed `Conversation` types to generic `KnowledgeItem`.
    - [x] Implemented `KnowledgeSource` interface.
    - [x] Created `SourceManager` orchestrator.
- [x] **Database & Schema:**
    - [x] Added `documents` table to SQLite.
    - [x] Updated `atomic_units` to support `document_id`.
    - [x] Patched schema (`ALTER TABLE`) to fix missing columns.
- [x] **File System Adapter (Federated):**
    - [x] Implemented `LocalFileSource`.
    - [x] Added `config/sources.yaml` for unified configuration.
    - [x] Integrated `fast-glob` for efficient scanning.
    - [x] Implemented Stable ID generation (Path Hash).
    - [x] **Zero-Copy Validation:** Successfully indexed Dropbox MDC folders in-place.
- [x] **Markdown Export:**
    - [x] Updated `MarkdownWriter` to support Document frontmatter.
    - [x] Fixed `undefined` YAML bug.

## 📋 Exhaustive Todo List

### 🔌 Adapters & Data Ingestion
- [ ] **PDF Support (Critical):**
    - [ ] Install `pdf-parse` or `pdf.js-extract`.
    - [ ] Implement text extraction logic in `LocalFileSource`.
    - [ ] *Bonus:* OCR integration (Tesseract) for scanned docs (like `padavano-mdc`).
- [ ] **Apple Notes Adapter:**
    - [ ] Create JXA (JavaScript for Automation) script to export Notes to JSON.
    - [ ] Build `AppleNotesSource` to ingest the JSON stream.
- [ ] **Web Clipper / Bookmarks:**
    - [ ] Create `BrowserSource` to ingest Chrome/Safari bookmarks.
    - [ ] (Future) MCP Server to clip active tabs.
- [ ] **Chat Integrations (Direct):**
    - [ ] **ChatGPT:** Implement Playwright scraper for `chatgpt.com`.
    - [ ] **Gemini:** Implement Playwright scraper for `aistudio.google.com`.

### 🧠 Intelligence & Atomization
- [ ] **Smart Chunking:**
    - [ ] Upgrade `KnowledgeAtomizer` to split long Documents by H1/H2 headers.
    - [ ] Implement sliding window chunking for unstructured text files.
- [ ] **Multimedia Handling:**
    - [ ] Detect images in Markdown/HTML and store references.
    - [ ] (Future) Vision API to caption images during ingestion.

### ⚙️ Infrastructure & Ops
- [ ] **Real-Time Watcher:**
    - [ ] Install `chokidar`.
    - [ ] Update `LocalFileSource` to support `watch_mode: true` (incremental updates without full re-scan).
- [ ] **Vector Database:**
    - [ ] Verify embeddings generation for new Document types.
    - [ ] Tune chunk size for Documents vs Chats.

### 🖥️ User Experience (CLI & Web)
- [ ] **Unified Search CLI:**
    - [ ] Update `npm run search` to display "Source" (e.g., "📂 Dropbox" vs "🤖 Claude").
    - [ ] Add filters: `npm run search "taxes" --source=dropbox`.
- [ ] **Stats & Dashboard:**
    - [ ] Update `PHASE2-SUMMARY.md` or a new `DASHBOARD.md` with live stats from the DB.

## 🗓 Implementation Plan

### Step 1: Binary Parsing (Immediate)
We have many PDFs in the Dropbox `padavano-mdc` folder that are currently indexed as `[Binary File]`. We must extract their text to make them searchable.

### Step 2: Semantic Search Verification
Ensure that the generic `AtomicUnit` is correctly vectorizing document content, not just metadata.

### Step 3: Real-Time Sync
Turn on the `chokidar` watcher so the knowledge base updates the moment a file is saved in Dropbox.