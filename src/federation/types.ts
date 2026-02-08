export type FederatedSourceKind = 'local-filesystem';
export type FederatedSourceStatus = 'active' | 'disabled';
export type FederatedScanStatus = 'running' | 'completed' | 'failed';

export interface FederatedSourceRecord {
  id: string;
  name: string;
  kind: FederatedSourceKind;
  status: FederatedSourceStatus;
  rootPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastScanAt?: string;
  lastScanStatus?: FederatedScanStatus;
  lastScanSummary?: Record<string, unknown>;
}

export interface FederatedDocumentRecord {
  id: string;
  sourceId: string;
  externalId: string;
  path: string;
  title: string;
  content: string;
  hash: string;
  sizeBytes: number | null;
  mimeType: string | null;
  modifiedAt: string | null;
  indexedAt: string;
  metadata: Record<string, unknown>;
}

export interface FederatedScanRunRecord {
  id: string;
  sourceId: string;
  status: FederatedScanStatus;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  summary: Record<string, unknown>;
}

export interface CreateFederatedSourceInput {
  name: string;
  rootPath: string;
  kind?: FederatedSourceKind;
  includePatterns?: string[];
  excludePatterns?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFederatedSourceInput {
  name?: string;
  status?: FederatedSourceStatus;
  rootPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  metadata?: Record<string, unknown>;
}

export interface LocalFilesystemDocument {
  externalId: string;
  path: string;
  title: string;
  content: string;
  hash: string;
  sizeBytes: number;
  mimeType: string;
  modifiedAt: string;
  metadata: Record<string, unknown>;
}

export interface FederatedSearchItem {
  id: string;
  sourceId: string;
  sourceName: string;
  path: string;
  title: string;
  snippet: string;
  mimeType: string | null;
  modifiedAt: string | null;
  indexedAt: string;
}
