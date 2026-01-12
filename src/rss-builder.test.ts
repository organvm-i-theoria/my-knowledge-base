import { describe, it, expect, beforeEach } from 'vitest';
import { RSSBuilder, RSSHelper } from './rss-builder.js';
import { AtomicUnit } from './types.js';

describe('RSSBuilder', () => {
  let builder: RSSBuilder;

  beforeEach(() => {
    builder = new RSSBuilder();
  });

  const createUnit = (
    overrides: Partial<AtomicUnit> = {}
  ): AtomicUnit => ({
    id: 'unit-1',
    type: 'insight',
    timestamp: new Date(),
    title: 'Test Unit',
    content: 'Test content',
    context: 'Test context',
    tags: [],
    category: 'programming',
    relatedUnits: [],
    keywords: [],
    ...overrides,
  });

  describe('Channel Setup', () => {
    it('sets channel metadata', () => {
      const channel = {
        title: 'Test Feed',
        link: 'http://example.com',
        description: 'Test Description',
        lastBuildDate: new Date(),
      };

      builder.setChannel(channel);

      const xml = builder.build();
      expect(xml).toContain('<title>Test Feed</title>');
      expect(xml).toContain('<link>http://example.com</link>');
      expect(xml).toContain('<description>Test Description</description>');
    });

    it('requires channel before building', () => {
      expect(() => builder.build()).toThrow('Channel metadata not set');
    });

    it('builds valid RSS 2.0 XML', () => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });

      const xml = builder.build();
      expect(xml).toMatch(/^<\?xml version="1\.0"/);
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain('</rss>');
    });
  });

  describe('Item Addition', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });
    });

    it('adds atomic units as items', () => {
      const unit = createUnit({ title: 'My Unit', id: 'unit-123' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toContain('<title>My Unit</title>');
      expect(xml).toContain('<guid isPermaLink="false">unit-123</guid>');
    });

    it('includes item links', () => {
      const unit = createUnit({ id: 'test-id' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toContain('/units/test-id');
    });

    it('includes item categories', () => {
      const unit = createUnit({ category: 'design' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toContain('<category>design</category>');
    });

    it('tracks item count', () => {
      expect(builder.getItemCount()).toBe(0);

      builder.addItem(createUnit());
      expect(builder.getItemCount()).toBe(1);

      builder.addItem(createUnit({ id: 'unit-2' }));
      expect(builder.getItemCount()).toBe(2);
    });
  });

  describe('XML Escaping', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });
    });

    it('escapes HTML entities in titles', () => {
      const unit = createUnit({ title: 'Title with <tag> & "quotes"' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toContain('Title with &lt;tag&gt; &amp; &quot;quotes&quot;');
    });

    it('escapes content properly', () => {
      const unit = createUnit({ content: '<script>alert("xss")</script>' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).not.toContain('<script>');
      expect(xml).toContain('&lt;script&gt;');
    });

    it('escapes ampersands correctly', () => {
      const unit = createUnit({ content: 'Coffee & Tea' });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toContain('Coffee &amp; Tea');
    });
  });

  describe('Date Formatting', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date('2024-01-15T12:00:00Z'),
      });
    });

    it('formats dates as RFC 822', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const unit = createUnit({ timestamp: date });
      builder.addItem(unit);

      const xml = builder.build();
      expect(xml).toMatch(/Mon, 15 Jan 2024 12:00:00 \+0000/);
    });

    it('formats different dates correctly', () => {
      const date1 = new Date('2024-01-01T00:00:00Z');
      const date2 = new Date('2024-12-31T23:59:59Z');

      builder.addItem(createUnit({ id: 'unit-1', timestamp: date1 }));
      builder.addItem(createUnit({ id: 'unit-2', timestamp: date2 }));

      const xml = builder.build();
      expect(xml).toContain('Mon, 01 Jan 2024 00:00:00 +0000');
      expect(xml).toContain('Tue, 31 Dec 2024 23:59:59 +0000');
    });

    it('includes lastBuildDate in channel', () => {
      const xml = builder.build();
      expect(xml).toContain('<lastBuildDate>');
    });
  });

  describe('Sorting and Filtering', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });
    });

    it('sorts items by date (newest first)', () => {
      const date1 = new Date('2024-01-10');
      const date2 = new Date('2024-01-20');
      const date3 = new Date('2024-01-15');

      builder.addItem(createUnit({ id: 'unit-1', timestamp: date1 }));
      builder.addItem(createUnit({ id: 'unit-2', timestamp: date2 }));
      builder.addItem(createUnit({ id: 'unit-3', timestamp: date3 }));

      builder.sortByDate();

      const xml = builder.build();
      const unit2Pos = xml.indexOf('unit-2');
      const unit3Pos = xml.indexOf('unit-3');
      const unit1Pos = xml.indexOf('unit-1');

      expect(unit2Pos).toBeLessThan(unit3Pos);
      expect(unit3Pos).toBeLessThan(unit1Pos);
    });

    it('filters items by category', () => {
      builder.addItem(createUnit({ id: 'unit-1', category: 'programming' }));
      builder.addItem(createUnit({ id: 'unit-2', category: 'design' }));
      builder.addItem(createUnit({ id: 'unit-3', category: 'programming' }));

      builder.filterByCategory('programming');

      expect(builder.getItemCount()).toBe(2);
      const xml = builder.build();
      expect(xml).toContain('unit-1');
      expect(xml).not.toContain('unit-2');
      expect(xml).toContain('unit-3');
    });

    it('limits number of items', () => {
      for (let i = 0; i < 10; i++) {
        builder.addItem(createUnit({ id: `unit-${i}` }));
      }

      builder.limit(3);
      expect(builder.getItemCount()).toBe(3);
    });

    it('clears items', () => {
      builder.addItem(createUnit());
      builder.addItem(createUnit({ id: 'unit-2' }));

      expect(builder.getItemCount()).toBe(2);

      builder.clear();
      expect(builder.getItemCount()).toBe(0);
    });
  });

  describe('Chaining', () => {
    it('supports method chaining', () => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });

      const result = builder
        .addItem(createUnit({ id: 'unit-1', category: 'programming', timestamp: new Date() }))
        .addItem(
          createUnit({
            id: 'unit-2',
            category: 'design',
            timestamp: new Date('2024-01-01'),
          })
        )
        .addItem(
          createUnit({
            id: 'unit-3',
            category: 'programming',
            timestamp: new Date('2024-01-02'),
          })
        )
        .filterByCategory('programming')
        .sortByDate();

      expect(builder.getItemCount()).toBe(2);
    });
  });

  describe('Required Fields', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });
    });

    it('includes all required RSS fields', () => {
      builder.addItem(createUnit());

      const xml = builder.build();

      // Required channel elements
      expect(xml).toContain('<channel>');
      expect(xml).toContain('<title>');
      expect(xml).toContain('<link>');
      expect(xml).toContain('<description>');

      // Required item elements
      expect(xml).toContain('<item>');
      expect(xml).toContain('<guid');
      expect(xml).toContain('<pubDate>');
    });

    it('includes language specification', () => {
      const xml = builder.build();
      expect(xml).toContain('<language>');
    });
  });

  describe('Special Cases', () => {
    beforeEach(() => {
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });
    });

    it('handles empty feed', () => {
      const xml = builder.build();
      expect(xml).toContain('<rss');
      expect(xml).toContain('</rss>');
    });

    it('handles units with special characters', () => {
      const unit = createUnit({
        title: 'Title with émojis 🚀',
        content: 'Content with special: éàü',
      });

      builder.addItem(unit);
      const xml = builder.build();

      expect(xml).toContain('émojis');
      expect(xml).toContain('éàü');
    });

    it('handles long content correctly', () => {
      const longContent = 'x'.repeat(1000);
      const unit = createUnit({ content: longContent });

      builder.addItem(unit);
      const xml = builder.build();

      expect(xml).toContain(longContent);
    });
  });
});

describe('RSSHelper', () => {
  const createUnit = (overrides: Partial<AtomicUnit> = {}): AtomicUnit => ({
    id: 'unit-1',
    type: 'insight',
    timestamp: new Date(),
    title: 'Test Unit',
    content: 'Test content',
    context: 'Test context',
    tags: [],
    category: 'programming',
    relatedUnits: [],
    keywords: [],
    ...overrides,
  });

  describe('createFeedFromUnits', () => {
    it('creates RSS feed from units', () => {
      const units = [
        createUnit({ id: 'unit-1' }),
        createUnit({ id: 'unit-2' }),
      ];

      const rss = RSSHelper.createFeedFromUnits(units, 'My Feed', 'http://example.com');

      expect(rss).toContain('<rss');
      expect(rss).toContain('My Feed');
      expect(rss).toContain('unit-1');
      expect(rss).toContain('unit-2');
    });

    it('sorts units by timestamp', () => {
      const units = [
        createUnit({ id: 'unit-1', timestamp: new Date('2024-01-10') }),
        createUnit({ id: 'unit-2', timestamp: new Date('2024-01-20') }),
        createUnit({ id: 'unit-3', timestamp: new Date('2024-01-15') }),
      ];

      const rss = RSSHelper.createFeedFromUnits(units, 'Feed', 'http://example.com');

      const unit2Pos = rss.indexOf('unit-2');
      const unit3Pos = rss.indexOf('unit-3');
      const unit1Pos = rss.indexOf('unit-1');

      expect(unit2Pos).toBeLessThan(unit3Pos);
      expect(unit3Pos).toBeLessThan(unit1Pos);
    });
  });

  describe('createCategoryFeed', () => {
    it('creates category-specific feed', () => {
      const units = [
        createUnit({ id: 'unit-1', category: 'programming' }),
        createUnit({ id: 'unit-2', category: 'design' }),
        createUnit({ id: 'unit-3', category: 'programming' }),
      ];

      const rss = RSSHelper.createCategoryFeed(units, 'programming', 'http://example.com');

      expect(rss).toContain('unit-1');
      expect(rss).not.toContain('unit-2');
      expect(rss).toContain('unit-3');
      expect(rss).toContain('Programming');
    });

    it('filters only matching category', () => {
      const units = [
        createUnit({ category: 'design' }),
        createUnit({ category: 'design' }),
        createUnit({ category: 'research' }),
      ];

      const rss = RSSHelper.createCategoryFeed(units, 'design', 'http://example.com');

      // Should have 2 items for design
      const itemMatches = rss.match(/<item>/g) || [];
      expect(itemMatches.length).toBe(2);
    });
  });

  describe('validateFeed', () => {
    it('validates valid RSS feed', () => {
      const builder = new RSSBuilder();
      builder.setChannel({
        title: 'Feed',
        link: 'http://example.com',
        description: 'Desc',
        lastBuildDate: new Date(),
      });

      const xml = builder.build();
      expect(RSSHelper.validateFeed(xml)).toBe(true);
    });

    it('rejects invalid feeds', () => {
      expect(RSSHelper.validateFeed('not xml')).toBe(false);
      expect(RSSHelper.validateFeed('<html></html>')).toBe(false);
      expect(RSSHelper.validateFeed('')).toBe(false);
    });

    it('requires essential elements', () => {
      const incomplete = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
  </channel>
</rss>`;

      expect(RSSHelper.validateFeed(incomplete)).toBe(false);
    });
  });
});
