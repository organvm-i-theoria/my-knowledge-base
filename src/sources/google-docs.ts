/**
 * Google Docs Knowledge Source (Read-Only)
 * Syncs documents from Google Drive and converts to markdown
 */

import { KnowledgeItem, ExportOptions, KnowledgeDocument } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';
import { GoogleAuthHelper, GoogleCredentials } from './google-auth.js';
import { randomUUID } from 'crypto';

export interface GoogleDocsConfig {
  enabled: boolean;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes: string[];
  folders: Array<{
    id: string;
    name: string;
  }>;
}

export class GoogleDocsSource implements KnowledgeSource {
  id = 'google-docs';
  name = 'Google Docs';
  type: 'file' = 'file';

  private auth: GoogleAuthHelper | null = null;
  private config: GoogleDocsConfig | null = null;
  private initialized = false;

  async init(options?: ExportOptions): Promise<void> {
    if (this.initialized) return;

    // Load configuration from environment
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

    if (!clientId || !clientSecret) {
      console.warn(
        '⚠️  Google Docs integration skipped: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not configured'
      );
      return;
    }

    this.auth = new GoogleAuthHelper(clientId, clientSecret, redirectUri);

    // Try to load existing tokens
    const tokens = this.auth.loadTokens();
    if (!tokens) {
      console.warn(
        '⚠️  Google Docs authentication required. Run: npm run auth:google-docs'
      );
      return;
    }

    if (!this.auth.areTokensValid()) {
      try {
        await this.auth.refreshToken();
      } catch (e) {
        console.warn('⚠️  Google Docs token refresh failed. Re-authenticate required.');
        return;
      }
    }

    this.config = {
      enabled: true,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scopes: [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      folders: [
        {
          id: process.env.GOOGLE_DOCS_FOLDER_ID || 'root',
          name: 'My Drive',
        },
      ],
    };

    this.initialized = true;
  }

  async listItems(): Promise<SourceItemReference[]> {
    if (!this.initialized || !this.auth) {
      return [];
    }

    const accessToken = await this.auth.getValidAccessToken();
    const items: SourceItemReference[] = [];

    // Query Drive API for documents in configured folders
    for (const folder of this.config?.folders || []) {
      try {
        const documents = await this.queryGoogleDrive(accessToken, folder.id);
        items.push(...documents);
      } catch (e) {
        console.error(`Failed to list documents from folder ${folder.id}:`, e);
      }
    }

    return items;
  }

  async exportItem(id: string): Promise<KnowledgeItem> {
    if (!this.initialized || !this.auth) {
      throw new Error('Google Docs source not initialized');
    }

    const accessToken = await this.auth.getValidAccessToken();
    return this.fetchAndConvertDocument(accessToken, id);
  }

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    if (!this.initialized) {
      await this.init(options);
    }

    if (!this.initialized || !this.auth) {
      return [];
    }

    try {
      const items = await this.listItems();
      const documents: KnowledgeItem[] = [];

      const accessToken = await this.auth.getValidAccessToken();

      for (const item of items) {
        try {
          const doc = await this.fetchAndConvertDocument(accessToken, item.id);
          documents.push(doc);
        } catch (e) {
          console.error(`Failed to export document ${item.id}:`, e);
        }
      }

      return documents;
    } catch (e) {
      console.error('Google Docs export failed:', e);
      return [];
    }
  }

  /**
   * Query Google Drive for documents
   */
  private async queryGoogleDrive(accessToken: string, folderId: string): Promise<SourceItemReference[]> {
    const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');

    url.searchParams.set('q', query);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    return (data.files || []).map((file: any) => ({
      id: file.id,
      title: file.name,
      url: file.webViewLink,
      metadata: {
        modifiedTime: file.modifiedTime,
      },
    }));
  }

  /**
   * Fetch document from Google Docs API and convert to markdown
   */
  private async fetchAndConvertDocument(
    accessToken: string,
    documentId: string
  ): Promise<KnowledgeDocument> {
    const url = `https://docs.googleapis.com/v1/documents/${documentId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Google Docs API error: ${response.statusText}`);
    }

    const docData = await response.json() as any;

    const markdown = this.convertToMarkdown(docData);
    const now = new Date();

    return {
      id: documentId,
      title: docData.title || 'Untitled',
      content: markdown,
      format: 'markdown',
      created: now,
      modified: now,
      url: `https://docs.google.com/document/d/${documentId}`,
      metadata: {
        source: 'google-docs',
        documentId,
        revisionId: docData.revisionId,
      },
    };
  }

  /**
   * Convert Google Docs structure to markdown
   * Handles headings, paragraphs, lists, tables, code blocks
   */
  private convertToMarkdown(docData: any): string {
    const body = docData.body?.content || [];
    const namedStyles = docData.namedStyles?.styles || [];
    const lines: string[] = [];

    let inList = false;
    let listLevel = 0;

    for (const element of body) {
      if (element.paragraph) {
        const para = element.paragraph;

        // Detect heading style
        const styleId = para.paragraphStyle?.namedStyleType;
        const headingLevel = this.getHeadingLevel(styleId);

        // Handle list items
        if (para.bullet) {
          inList = true;
          const level = para.bullet.listProperties?.nestingLevel || 0;
          const prefix = level === 0 ? '- ' : '  '.repeat(level) + '- ';
          const text = this.extractParagraphText(para);
          lines.push(prefix + text);
          listLevel = level;
          continue;
        } else if (inList) {
          inList = false;
          lines.push('');
        }

        // Handle headings
        if (headingLevel > 0) {
          const heading = '#'.repeat(headingLevel) + ' ' + this.extractParagraphText(para);
          lines.push(heading);
          lines.push('');
          continue;
        }

        // Handle regular paragraphs
        const text = this.extractParagraphText(para);
        if (text.length > 0) {
          lines.push(text);
          lines.push('');
        }
      } else if (element.table) {
        // Convert table to markdown
        const tableMarkdown = this.convertTable(element.table);
        lines.push(tableMarkdown);
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Extract text from a paragraph element
   */
  private extractParagraphText(para: any): string {
    const texts: string[] = [];

    for (const run of para.elements || []) {
      if (run.textRun) {
        let text = run.textRun.content || '';

        // Handle text formatting
        const style = run.textRun.textStyle || {};
        if (style.bold) text = `**${text}**`;
        if (style.italic) text = `*${text}*`;
        if (style.strikethrough) text = `~~${text}~~`;

        texts.push(text);
      }
    }

    return texts.join('').trim();
  }

  /**
   * Convert Google Docs table to markdown
   */
  private convertTable(table: any): string {
    const rows = table.tableRows || [];
    const markdown: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.tableCells || [];
      const cellTexts = cells.map((cell: any) => {
        const content = cell.content || [];
        const texts: string[] = [];

        for (const elem of content) {
          if (elem.paragraph) {
            texts.push(this.extractParagraphText(elem.paragraph));
          }
        }

        return texts.join(' ').trim();
      });

      markdown.push('| ' + cellTexts.join(' | ') + ' |');

      // Add separator after first row (header)
      if (i === 0) {
        const separator = cellTexts.map(() => '---').join(' | ');
        markdown.push('| ' + separator + ' |');
      }
    }

    return markdown.join('\n');
  }

  /**
   * Determine heading level from Google Docs style
   */
  private getHeadingLevel(styleId?: string): number {
    if (!styleId) return 0;

    const styleMap: Record<string, number> = {
      HEADING_1: 1,
      HEADING_2: 2,
      HEADING_3: 3,
      HEADING_4: 4,
      HEADING_5: 5,
      HEADING_6: 6,
    };

    return styleMap[styleId] || 0;
  }

  async close(): Promise<void> {
    this.initialized = false;
    this.auth = null;
    this.config = null;
  }
}
