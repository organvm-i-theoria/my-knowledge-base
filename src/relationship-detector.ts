/**
 * Detect relationships between atomic units using Claude + embeddings
 */

import { ClaudeService } from './claude-service.js';
import { VectorDatabase } from './vector-database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { AtomicUnit } from './types.js';

export interface Relationship {
  fromUnit: string;
  toUnit: string;
  relationshipType: 'related' | 'prerequisite' | 'expands-on' | 'contradicts' | 'implements';
  strength: number; // 0-1
  explanation: string;
}

export class RelationshipDetector {
  private claude: ClaudeService;
  private vectorDb: VectorDatabase;
  private embeddingsService: EmbeddingsService;

  private systemPrompt = `You are an expert at identifying relationships between pieces of knowledge.

Given two pieces of content, determine:
1. If they are related
2. The type of relationship
3. How strong the relationship is (0-1)
4. A brief explanation

Relationship types:
- "related": General topical relationship
- "prerequisite": One concept is needed to understand the other
- "expands-on": One builds upon or elaborates on the other
- "contradicts": They present conflicting information
- "implements": One shows implementation of the other's concept

Output JSON format:
{
  "isRelated": true,
  "relationshipType": "expands-on",
  "strength": 0.85,
  "explanation": "Unit B provides specific implementation details for the pattern described in Unit A"
}

Be selective - only mark as related if there's a meaningful connection.`;

  constructor(
    vectorDbPath: string = './atomized/embeddings/chroma',
    claude?: ClaudeService,
    vectorDb?: VectorDatabase,
    embeddingsService?: EmbeddingsService
  ) {
    this.claude = claude || new ClaudeService();
    this.vectorDb = vectorDb || new VectorDatabase(vectorDbPath);
    this.embeddingsService = embeddingsService || new EmbeddingsService();
  }

  async init() {
    await this.vectorDb.init();
  }

  /**
   * Find related units using vector similarity + Claude validation
   */
  async findRelatedUnits(
    unit: AtomicUnit,
    candidateLimit: number = 10,
    minSimilarity: number = 0.7
  ): Promise<Relationship[]> {
    console.log(`🔗 Finding relationships for: ${unit.title}`);

    // Step 1: Use vector similarity to find candidates
    if (!unit.embedding) {
      // Generate embedding if not present
      const text = `${unit.title}\n\n${unit.content}`;
      unit.embedding = await this.embeddingsService.generateEmbedding(text);
    }

    const candidates = await this.vectorDb.searchByEmbedding(
      unit.embedding,
      candidateLimit
    );

    // Filter by similarity threshold and exclude self
    const viableCandidates = candidates.filter(
      c => c.unit.id !== unit.id && c.score >= minSimilarity
    );

    if (viableCandidates.length === 0) {
      console.log('  No similar units found');
      return [];
    }

    console.log(`  Found ${viableCandidates.length} candidates (similarity >= ${minSimilarity})`);

    // Step 2: Use Claude to validate and classify relationships
    const relationships: Relationship[] = [];

    for (const candidate of viableCandidates) {
      const relationship = await this.analyzeRelationship(unit, candidate.unit);

      if (relationship && relationship.strength > 0.5) {
        relationships.push({
          fromUnit: unit.id,
          toUnit: candidate.unit.id,
          relationshipType: relationship.relationshipType,
          strength: relationship.strength,
          explanation: relationship.explanation,
        });
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`  ✅ Found ${relationships.length} meaningful relationships`);
    return relationships;
  }

  /**
   * Analyze relationship between two units using Claude
   */
  private async analyzeRelationship(
    unit1: AtomicUnit,
    unit2: AtomicUnit
  ): Promise<any> {
    const prompt = `Analyze the relationship between these two pieces of content:

**Content A:**
Title: ${unit1.title}
${unit1.content.slice(0, 500)}

**Content B:**
Title: ${unit2.title}
${unit2.content.slice(0, 500)}

Are they related? If so, what type of relationship and how strong?`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: this.systemPrompt,
        maxTokens: 300,
        temperature: 0.2,
        useCache: true,
      });

      const parsed = this.parseRelationshipResponse(response);

      if (!parsed.isRelated) {
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('Failed to analyze relationship:', error);
      return null;
    }
  }

  /**
   * Build relationship graph for all units
   */
  async buildRelationshipGraph(
    units: AtomicUnit[]
  ): Promise<Map<string, Relationship[]>> {
    console.log(`\n🕸️  Building relationship graph for ${units.length} units...\n`);

    const graph = new Map<string, Relationship[]>();

    for (const unit of units) {
      const relationships = await this.findRelatedUnits(unit, 10, 0.75);
      graph.set(unit.id, relationships);

      // Progress indicator
      console.log(`  Progress: ${graph.size}/${units.length}`);
    }

    // Calculate statistics
    const totalRelationships = Array.from(graph.values()).reduce(
      (sum, rels) => sum + rels.length,
      0
    );

    console.log(`\n✅ Relationship graph complete:`);
    console.log(`  - Units: ${units.length}`);
    console.log(`  - Relationships: ${totalRelationships}`);
    console.log(`  - Avg per unit: ${(totalRelationships / units.length).toFixed(1)}`);

    this.claude.printStats();

    return graph;
  }

  /**
   * Parse Claude's relationship response
   */
  private parseRelationshipResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { isRelated: false };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return { isRelated: false };
    }
  }

  /**
   * Get token usage statistics
   */
  getStats() {
    return this.claude.getTokenStats();
  }
}
