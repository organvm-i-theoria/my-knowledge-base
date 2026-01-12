/**
 * RSS 2.0 Feed Builder
 * Generates valid RSS 2.0 XML feeds from atomic units
 * No external dependencies - pure TypeScript implementation
 */

import { AtomicUnit } from './types.js';

export interface RSSChannel {
  title: string;
  link: string;
  description: string;
  language?: string;
  copyright?: string;
  pubDate?: Date;
  lastBuildDate: Date;
  ttl?: number; // Time-to-live in minutes
}

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  category?: string;
  author?: string;
  content?: string;
}

export class RSSBuilder {
  private channel: RSSChannel | null = null;
  private items: RSSItem[] = [];

  /**
   * Set channel metadata
   */
  setChannel(metadata: RSSChannel): RSSBuilder {
    this.channel = metadata;
    return this;
  }

  /**
   * Add item from atomic unit
   */
  addItem(unit: AtomicUnit): RSSBuilder {
    const item: RSSItem = {
      title: this.escapeXML(unit.title),
      link: `${this.channel?.link}/units/${unit.id}` || `/units/${unit.id}`,
      description: this.escapeXML(unit.content),
      pubDate: this.formatRFC822(unit.timestamp),
      guid: unit.id,
      category: unit.category,
      author: undefined,
      content: this.escapeXML(unit.content),
    };

    this.items.push(item);
    return this;
  }

  /**
   * Add raw item
   */
  addRawItem(item: RSSItem): RSSBuilder {
    this.items.push(item);
    return this;
  }

  /**
   * Sort items by date (newest first)
   */
  sortByDate(): RSSBuilder {
    this.items.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      return dateB - dateA;
    });
    return this;
  }

  /**
   * Filter items by category
   */
  filterByCategory(category: string): RSSBuilder {
    this.items = this.items.filter((item) => item.category === category);
    return this;
  }

  /**
   * Limit number of items
   */
  limit(count: number): RSSBuilder {
    this.items = this.items.slice(0, count);
    return this;
  }

  /**
   * Generate RSS 2.0 XML document
   */
  build(): string {
    if (!this.channel) {
      throw new Error('Channel metadata not set. Call setChannel() first.');
    }

    const channelXml = this.buildChannelXML();
    const itemsXml = this.items.map((item) => this.buildItemXML(item)).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
${channelXml}
    <docs>http://www.rssboard.org/rss-specification</docs>
    <generator>Knowledge Base RSS Generator v1.0</generator>
${itemsXml ? `\n    ${itemsXml}` : ''}
  </channel>
</rss>`;
  }

  /**
   * Build channel XML
   */
  private buildChannelXML(): string {
    const channel = this.channel!;
    const pubDate = channel.pubDate ? this.formatRFC822(channel.pubDate) : '';
    const language = channel.language || 'en-us';
    const ttl = channel.ttl || 3600;

    const xml = `    <title>${this.escapeXML(channel.title)}</title>
    <link>${this.escapeXML(channel.link)}</link>
    <description>${this.escapeXML(channel.description)}</description>
    <language>${language}</language>
    <lastBuildDate>${this.formatRFC822(channel.lastBuildDate)}</lastBuildDate>
    <ttl>${ttl}</ttl>`;

    if (channel.copyright) {
      return xml + `\n    <copyright>${this.escapeXML(channel.copyright)}</copyright>`;
    }

    return xml;
  }

  /**
   * Build item XML
   */
  private buildItemXML(item: RSSItem): string {
    const categoryXml = item.category ? `<category>${this.escapeXML(item.category)}</category>` : '';
    const authorXml = item.author ? `<author>${this.escapeXML(item.author)}</author>` : '';

    return `<item>
      <title>${item.title}</title>
      <link>${this.escapeXML(item.link)}</link>
      <guid isPermaLink="false">${item.guid}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description>${item.description}</description>
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
      ${categoryXml ? `<category>${categoryXml}</category>` : ''}
      ${authorXml ? `<author>${authorXml}</author>` : ''}
    </item>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(text: string): string {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Format date as RFC 822 format (e.g., "Mon, 15 Jan 2024 12:00:00 +0000")
   */
  private formatRFC822(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = days[date.getUTCDay()];
    const dateNum = String(date.getUTCDate()).padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${day}, ${dateNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
  }

  /**
   * Get current items count
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Clear all items
   */
  clear(): RSSBuilder {
    this.items = [];
    return this;
  }
}

/**
 * Helper class for common RSS operations
 */
export class RSSHelper {
  /**
   * Create RSS feed from atomic units
   */
  static createFeedFromUnits(
    units: AtomicUnit[],
    channelTitle: string,
    channelLink: string,
    baseUrl?: string
  ): string {
    const builder = new RSSBuilder();

    builder.setChannel({
      title: channelTitle,
      link: baseUrl || channelLink,
      description: `Latest updates from ${channelTitle}`,
      language: 'en-us',
      lastBuildDate: new Date(),
      ttl: 3600,
    });

    // Add units sorted by timestamp (newest first)
    const sortedUnits = [...units].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    for (const unit of sortedUnits) {
      builder.addItem(unit);
    }

    return builder.build();
  }

  /**
   * Create category-specific RSS feed
   */
  static createCategoryFeed(
    units: AtomicUnit[],
    category: string,
    baseUrl: string
  ): string {
    const filtered = units.filter((u) => u.category === category);

    const builder = new RSSBuilder();
    builder.setChannel({
      title: `Knowledge Base - ${category.charAt(0).toUpperCase() + category.slice(1)}`,
      link: `${baseUrl}/feeds/${category}`,
      description: `Latest ${category} knowledge units`,
      language: 'en-us',
      lastBuildDate: new Date(),
      ttl: 3600,
    });

    const sortedUnits = [...filtered].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    for (const unit of sortedUnits) {
      builder.addItem(unit);
    }

    return builder.build();
  }

  /**
   * Validate RSS feed XML
   */
  static validateFeed(rssXml: string): boolean {
    try {
      // Basic validation: check for required elements
      return (
        rssXml.includes('<?xml') &&
        rssXml.includes('<rss') &&
        rssXml.includes('<channel>') &&
        rssXml.includes('<title>') &&
        rssXml.includes('<link>') &&
        rssXml.includes('<description>')
      );
    } catch {
      return false;
    }
  }
}
