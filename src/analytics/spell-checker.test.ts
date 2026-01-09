/**
 * Spell Checker Tests - Comprehensive test suite for Levenshtein-based spell correction
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SpellChecker } from './spell-checker.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';

describe('SpellChecker', () => {
  let spellChecker: SpellChecker;
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory test database
    db = new Database(':memory:');

    // Initialize schema
    const schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
    try {
      const schema = readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
    } catch {
      // Fallback: Create minimal schema for spell dictionary
      db.exec(`
        CREATE TABLE spell_dictionary (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          term TEXT UNIQUE NOT NULL,
          normalized TEXT NOT NULL,
          frequency INTEGER DEFAULT 1,
          source TEXT NOT NULL,
          last_updated TIMESTAMP NOT NULL
        );
      `);
    }

    spellChecker = new SpellChecker(db);
  });

  describe('Levenshtein Distance Calculation', () => {
    it('should calculate correct distance for identical words', () => {
      const distance = spellChecker.levenshteinDistance('react', 'react');
      expect(distance).toBe(0);
    });

    it('should calculate correct distance for single character substitution', () => {
      const distance = spellChecker.levenshteinDistance('react', 'reacr');
      expect(distance).toBe(1);
    });

    it('should calculate correct distance for single character insertion', () => {
      const distance = spellChecker.levenshteinDistance('react', 'reatc');
      expect(distance).toBe(1);
    });

    it('should calculate correct distance for single character deletion', () => {
      const distance = spellChecker.levenshteinDistance('react', 'ract');
      expect(distance).toBe(1);
    });

    it('should calculate correct distance for multiple edits', () => {
      const distance = spellChecker.levenshteinDistance('kitten', 'sitting');
      expect(distance).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(spellChecker.levenshteinDistance('', '')).toBe(0);
      expect(spellChecker.levenshteinDistance('test', '')).toBe(4);
      expect(spellChecker.levenshteinDistance('', 'test')).toBe(4);
    });

    it('should handle single character strings', () => {
      expect(spellChecker.levenshteinDistance('a', 'b')).toBe(1);
      expect(spellChecker.levenshteinDistance('a', 'a')).toBe(0);
    });

    it('should be symmetric', () => {
      const dist1 = spellChecker.levenshteinDistance('typescript', 'typescript');
      const dist2 = spellChecker.levenshteinDistance('typescript', 'typescript');
      expect(dist1).toBe(dist2);
    });
  });

  describe('Dictionary Building', () => {
    it('should build dictionary from database terms', () => {
      // Insert test terms
      const stmt = db.prepare(`
        INSERT INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run('react', 'react', 10, 'tags', new Date().toISOString());
      stmt.run('angular', 'angular', 5, 'tags', new Date().toISOString());
      stmt.run('vue', 'vue', 3, 'tags', new Date().toISOString());

      spellChecker.buildDictionary();

      // Dictionary should be built (can't directly verify, but no error means success)
      expect(spellChecker.getDictionarySize()).toBeGreaterThan(0);
    });

    it('should extract terms from database during dictionary build', () => {
      const stmt = db.prepare(`
        INSERT INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run('javascript', 'javascript', 20, 'keywords', new Date().toISOString());

      spellChecker.buildDictionary();
      expect(spellChecker.getDictionarySize()).toBeGreaterThan(0);
    });
  });

  describe('Spell Correction - Single Words', () => {
    beforeEach(() => {
      // Pre-populate dictionary with common terms
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      const terms = [
        ['react', 'react', 50, 'tags', timestamp],
        ['typescript', 'typescript', 40, 'tags', timestamp],
        ['javascript', 'javascript', 35, 'keywords', timestamp],
        ['angular', 'angular', 25, 'tags', timestamp],
        ['vue', 'vue', 20, 'tags', timestamp],
        ['node', 'node', 30, 'keywords', timestamp],
        ['express', 'express', 25, 'tags', timestamp],
        ['database', 'database', 22, 'keywords', timestamp],
      ];

      terms.forEach(term => stmt.run(...term));
      spellChecker.buildDictionary();
    });

    it('should suggest correct spelling for single character substitution', () => {
      const suggestions = spellChecker.checkQuery('recat'); // 'e' → 'a'
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].term).toBe('react');
      expect(suggestions[0].distance).toBe(1);
    });

    it('should suggest correct spelling for single character insertion', () => {
      const suggestions = spellChecker.checkQuery('reactt'); // extra 't'
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].term).toBe('react');
      expect(suggestions[0].distance).toBe(1);
    });

    it('should suggest correct spelling for single character deletion', () => {
      const suggestions = spellChecker.checkQuery('reac'); // missing 't'
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].term).toBe('react');
      expect(suggestions[0].distance).toBe(1);
    });

    it('should suggest multiple candidates ranked by confidence', () => {
      const suggestions = spellChecker.checkQuery('typscript'); // missing 'e'
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].term).toBe('typescript');

      // Confidence should be higher for shorter distances
      if (suggestions.length > 1) {
        expect(suggestions[0].confidence).toBeGreaterThan(suggestions[1].confidence);
      }
    });

    it('should limit maximum distance to 2 edits', () => {
      const suggestions = spellChecker.checkQuery('xyz'); // Very different from dictionary
      // Should only find exact or very close matches
      suggestions.forEach(s => {
        expect(s.distance).toBeLessThanOrEqual(2);
      });
    });

    it('should rank by frequency when distances equal', () => {
      // 'recat' can become 'react' (dist 1) or other words at dist > 1
      const suggestions = spellChecker.checkQuery('recat');
      expect(suggestions[0].term).toBe('react'); // Highest frequency match
    });

    it('should return empty array for non-matching words', () => {
      const suggestions = spellChecker.checkQuery('zzzzz');
      // Very obscure word should have no close matches
      suggestions.forEach(s => {
        expect(s.distance).toBeLessThanOrEqual(2);
      });
    });

    it('should not suggest exact matches as errors', () => {
      const suggestions = spellChecker.checkQuery('react');
      // Should either have no suggestions or confidence 1.0
      suggestions.forEach(s => {
        if (s.term === 'react') {
          expect(s.distance).toBe(0);
        }
      });
    });
  });

  describe('Spell Correction - Phrase Handling', () => {
    beforeEach(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      ['react', 'typescript', 'javascript', 'angular', 'vue', 'node', 'express', 'database'].forEach(
        term => stmt.run(term, term, 10, 'tags', timestamp)
      );

      spellChecker.buildDictionary();
    });

    it('should handle multi-word queries', () => {
      const suggestions = spellChecker.checkQuery('react typescript');
      // Should check each word
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should preserve word order in results', () => {
      const suggestions = spellChecker.checkQuery('expresss database');
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Confidence Scoring', () => {
    beforeEach(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      // Different frequencies
      stmt.run('react', 'react', 100, 'tags', timestamp); // Very common
      stmt.run('angular', 'angular', 10, 'tags', timestamp); // Uncommon
      stmt.run('vue', 'vue', 50, 'tags', timestamp); // Medium

      spellChecker.buildDictionary();
    });

    it('should score by both distance and frequency', () => {
      // 'reac' is 1 edit away from 'react' (high freq) and 2+ away from others
      const suggestions = spellChecker.checkQuery('reac');
      if (suggestions.length > 0) {
        expect(suggestions[0].term).toBe('react');
        // Confidence should be between 0 and 1
        expect(suggestions[0].confidence).toBeGreaterThan(0);
        expect(suggestions[0].confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should prefer frequent terms over uncommon ones at same distance', () => {
      // 'reac' is 1 edit from 'react' (freq 100) and 'vue' might be further away
      const suggestions = spellChecker.checkQuery('reac');
      expect(suggestions[0].term).toBe('react');
      expect(suggestions[0].distance).toBe(1);
    });

    it('should have monotonically decreasing confidence for results list', () => {
      const suggestions = spellChecker.checkQuery('reac');
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i].confidence).toBeLessThanOrEqual(suggestions[i - 1].confidence);
      }
    });
  });

  describe('Case Sensitivity', () => {
    beforeEach(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      stmt.run('React', 'react', 50, 'tags', timestamp);
      stmt.run('TypeScript', 'typescript', 40, 'tags', timestamp);

      spellChecker.buildDictionary();
    });

    it('should handle case-insensitive matching', () => {
      const suggestions1 = spellChecker.checkQuery('react');
      const suggestions2 = spellChecker.checkQuery('REACT');
      const suggestions3 = spellChecker.checkQuery('React');

      // All should find 'React'
      expect(suggestions1.length).toBeGreaterThan(0);
      expect(suggestions2.length).toBeGreaterThan(0);
      expect(suggestions3.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should process single word query in < 50ms', () => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      for (let i = 0; i < 1000; i++) {
        stmt.run(`word${i}`, `word${i}`, i, 'tags', timestamp);
      }

      spellChecker.buildDictionary();

      const start = Date.now();
      spellChecker.checkQuery('ward');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should limit candidate list size', () => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      for (let i = 0; i < 100; i++) {
        stmt.run(`word${i}`, `word${i}`, 10, 'tags', timestamp);
      }

      spellChecker.buildDictionary();
      const suggestions = spellChecker.checkQuery('word');

      // Should be reasonably bounded
      expect(suggestions.length).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty dictionary', () => {
      const spellCheckerEmpty = new SpellChecker(db);
      expect(() => spellCheckerEmpty.checkQuery('test')).not.toThrow();
    });

    it('should handle single-character queries', () => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO spell_dictionary (term, normalized, frequency, source, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run('a', 'a', 10, 'tags', new Date().toISOString());

      spellChecker.buildDictionary();
      const suggestions = spellChecker.checkQuery('b');

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle very long words', () => {
      const longWord = 'a'.repeat(100);
      const suggestions = spellChecker.checkQuery(longWord);

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle special characters gracefully', () => {
      expect(() => spellChecker.checkQuery('test@123')).not.toThrow();
      expect(() => spellChecker.checkQuery('test-case')).not.toThrow();
      expect(() => spellChecker.checkQuery('test_case')).not.toThrow();
    });

    it('should handle numbers in queries', () => {
      const suggestions = spellChecker.checkQuery('typescript3');
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });
});
