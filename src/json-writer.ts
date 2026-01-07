/**
 * Write atomic units to JSON files
 */

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { AtomicUnit } from './types.js';

export class JSONWriter {
  private basePath: string;

  constructor(basePath: string = './atomized/json') {
    this.basePath = basePath;
  }

  /**
   * Write individual JSON files for each unit
   */
  writeUnits(units: AtomicUnit[]) {
    const unitsDir = join(this.basePath, 'units');
    if (!existsSync(unitsDir)) {
      mkdirSync(unitsDir, { recursive: true });
    }

    for (const unit of units) {
      const filename = join(unitsDir, `${unit.id}.json`);
      writeFileSync(filename, JSON.stringify(unit, null, 2));
    }

    console.log(`✅ Wrote ${units.length} JSON unit files`);
  }

  /**
   * Append to JSONL (newline-delimited JSON) for streaming
   */
  appendToJSONL(units: AtomicUnit[], filename: string = 'index.jsonl') {
    const filepath = join(this.basePath, filename);

    for (const unit of units) {
      appendFileSync(filepath, JSON.stringify(unit) + '\n');
    }

    console.log(`✅ Appended ${units.length} units to ${filepath}`);
  }

  /**
   * Write index file with all units
   */
  writeIndex(units: AtomicUnit[]) {
    const indexPath = join(this.basePath, 'index.json');

    const index = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      totalUnits: units.length,
      units: units.map(u => ({
        id: u.id,
        title: u.title,
        type: u.type,
        category: u.category,
        tags: u.tags,
        timestamp: u.timestamp
      }))
    };

    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`📚 Created index: ${indexPath}`);
  }
}
