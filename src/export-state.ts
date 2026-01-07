/**
 * Export state management for incremental exports
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from './logger.js';

export interface ExportedConversation {
  id: string;
  title: string;
  lastExportedAt: Date;
  messageCount: number;
  checksum?: string; // for detecting changes
}

export interface ExportState {
  version: number;
  lastExportTime: Date;
  lastExportMode: 'full' | 'incremental';
  exportedConversationIds: string[];
  conversationDetails: Map<string, ExportedConversation>;
  totalExported: number;
  totalSkipped: number;
}

/**
 * Manages state for incremental exports
 */
export class ExportStateManager {
  private statePath: string;
  private state: ExportState;

  constructor(statePath: string = './export-state.json') {
    this.statePath = statePath;
    this.state = this.loadState();
  }

  /**
   * Load state from file
   */
  private loadState(): ExportState {
    try {
      if (existsSync(this.statePath)) {
        const content = readFileSync(this.statePath, 'utf-8');
        const data = JSON.parse(content);

        // Convert timestamps back to Date objects
        const state: ExportState = {
          ...data,
          lastExportTime: new Date(data.lastExportTime),
          conversationDetails: new Map(
            Object.entries(data.conversationDetails || {}).map(([key, conv]: any) => [
              key,
              {
                ...conv,
                lastExportedAt: new Date(conv.lastExportedAt)
              }
            ])
          )
        };

        logger.info(
          `Loaded export state`,
          {
            conversations: state.exportedConversationIds.length,
            lastExport: state.lastExportTime.toLocaleString()
          },
          'ExportStateManager'
        );

        return state;
      }
    } catch (error) {
      logger.warn(
        `Failed to load export state: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'ExportStateManager'
      );
    }

    // Return default state
    return {
      version: 1,
      lastExportTime: new Date(0),
      lastExportMode: 'full',
      exportedConversationIds: [],
      conversationDetails: new Map(),
      totalExported: 0,
      totalSkipped: 0
    };
  }

  /**
   * Save state to file
   */
  private saveState(): void {
    try {
      const data = {
        ...this.state,
        lastExportTime: this.state.lastExportTime.toISOString(),
        conversationDetails: Object.fromEntries(
          Array.from(this.state.conversationDetails.entries()).map(([key, conv]) => [
            key,
            {
              ...conv,
              lastExportedAt: conv.lastExportedAt.toISOString()
            }
          ])
        )
      };

      writeFileSync(this.statePath, JSON.stringify(data, null, 2));

      logger.debug(
        `Export state saved`,
        { conversations: this.state.exportedConversationIds.length },
        'ExportStateManager'
      );
    } catch (error) {
      logger.warn(
        `Failed to save export state: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'ExportStateManager'
      );
    }
  }

  /**
   * Mark conversation as exported
   */
  markExported(id: string, title: string, messageCount: number, checksum?: string): void {
    this.state.exportedConversationIds.push(id);
    this.state.conversationDetails.set(id, {
      id,
      title,
      lastExportedAt: new Date(),
      messageCount,
      checksum
    });
    this.state.totalExported++;
    this.saveState();

    logger.debug(
      `Conversation marked as exported`,
      { id, title: title.substring(0, 50), messageCount },
      'ExportStateManager'
    );
  }

  /**
   * Check if conversation was already exported
   */
  isExported(id: string): boolean {
    return this.state.exportedConversationIds.includes(id);
  }

  /**
   * Get last export time
   */
  getLastExportTime(): Date {
    return this.state.lastExportTime;
  }

  /**
   * Get all exported conversation IDs
   */
  getExportedIds(): string[] {
    return [...this.state.exportedConversationIds];
  }

  /**
   * Get export details for a conversation
   */
  getExportDetails(id: string): ExportedConversation | undefined {
    return this.state.conversationDetails.get(id);
  }

  /**
   * Get conversations changed since last export
   */
  getChangedSince(conversationList: Array<{ id: string; title: string; messageCount?: number }>): Array<{
    conversation: (typeof conversationList)[0];
    isNew: boolean;
    details?: ExportedConversation;
  }> {
    return conversationList.map(conv => {
      const isNew = !this.isExported(conv.id);
      const details = this.getExportDetails(conv.id);

      return {
        conversation: conv,
        isNew,
        details: isNew ? undefined : details
      };
    });
  }

  /**
   * Start new export session
   */
  startExportSession(mode: 'full' | 'incremental'): void {
    this.state.lastExportMode = mode;
    this.state.lastExportTime = new Date();
    this.state.totalExported = 0;
    this.state.totalSkipped = 0;

    logger.info(`Export session started: ${mode}`, undefined, 'ExportStateManager');
  }

  /**
   * Complete export session
   */
  completeExportSession(): void {
    this.saveState();

    logger.info(
      `Export session completed`,
      {
        mode: this.state.lastExportMode,
        exported: this.state.totalExported,
        skipped: this.state.totalSkipped
      },
      'ExportStateManager'
    );
  }

  /**
   * Record skipped conversation
   */
  recordSkipped(): void {
    this.state.totalSkipped++;
  }

  /**
   * Reset state (for full export)
   */
  reset(): void {
    this.state = {
      version: 1,
      lastExportTime: new Date(),
      lastExportMode: 'full',
      exportedConversationIds: [],
      conversationDetails: new Map(),
      totalExported: 0,
      totalSkipped: 0
    };
    this.saveState();

    logger.info(`Export state reset`, undefined, 'ExportStateManager');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      lastExportTime: this.state.lastExportTime,
      lastExportMode: this.state.lastExportMode,
      totalConversationsExported: this.state.exportedConversationIds.length,
      totalExportedInSession: this.state.totalExported,
      totalSkippedInSession: this.state.totalSkipped,
      oldestExport: this.state.conversationDetails.size > 0
        ? Array.from(this.state.conversationDetails.values()).sort(
          (a, b) => a.lastExportedAt.getTime() - b.lastExportedAt.getTime()
        )[0]?.lastExportedAt
        : undefined,
      newestExport: this.state.conversationDetails.size > 0
        ? Array.from(this.state.conversationDetails.values()).sort(
          (a, b) => b.lastExportedAt.getTime() - a.lastExportedAt.getTime()
        )[0]?.lastExportedAt
        : undefined
    };
  }

  /**
   * Print statistics
   */
  printStats(): void {
    const stats = this.getStats();

    console.log('\n📊 Export State:');
    console.log(`  Last export: ${stats.lastExportTime.toLocaleString()}`);
    console.log(`  Mode: ${stats.lastExportMode}`);
    console.log(`  Total conversations exported: ${stats.totalConversationsExported}`);
    console.log(`  This session - Exported: ${stats.totalExportedInSession}, Skipped: ${stats.totalSkippedInSession}`);

    if (stats.oldestExport) {
      console.log(`  Oldest export: ${stats.oldestExport.toLocaleString()}`);
    }
    if (stats.newestExport) {
      console.log(`  Newest export: ${stats.newestExport.toLocaleString()}`);
    }
  }
}

/**
 * Global export state manager
 */
let globalStateManager: ExportStateManager | null = null;

export function getExportStateManager(statePath?: string): ExportStateManager {
  if (!globalStateManager) {
    globalStateManager = new ExportStateManager(statePath);
  }
  return globalStateManager;
}
