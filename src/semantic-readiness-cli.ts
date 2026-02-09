#!/usr/bin/env node
/**
 * Semantic/Hybrid runtime readiness verification.
 * Fails fast when required dependencies are missing or misconfigured.
 */

import { config } from 'dotenv';
import { getConfig, normalizeSearchPolicy, SearchPolicy } from './config.js';
import { EmbeddingsService } from './embeddings-service.js';
import { HybridSearch } from './hybrid-search.js';
import { VectorDatabase } from './vector-database.js';

config();

interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
  remediation?: string;
}

function emit(check: ReadinessCheck): void {
  const prefix = check.ok ? '✅' : '❌';
  console.log(`${prefix} ${check.name}: ${check.detail}`);
  if (!check.ok && check.remediation) {
    console.log(`   -> ${check.remediation}`);
  }
}

function isStrictPolicy(policy: SearchPolicy): boolean {
  return policy === 'strict';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checks: ReadinessCheck[] = [];
  const cfg = getConfig().getAll();
  const strictFlag = args.includes('--strict') || process.env.SEMANTIC_READINESS_STRICT === 'true';

  const semanticPolicy = normalizeSearchPolicy(
    process.env.KB_SEARCH_SEMANTIC_POLICY ?? cfg.search?.semanticPolicy,
    'degrade'
  );
  const hybridPolicy = normalizeSearchPolicy(
    process.env.KB_SEARCH_HYBRID_POLICY ?? cfg.search?.hybridPolicy,
    'degrade'
  );
  const strictMode = strictFlag || isStrictPolicy(semanticPolicy) || isStrictPolicy(hybridPolicy);

  const embeddingConfig = cfg.embedding || cfg.embeddings || {};
  const embeddingProvider = process.env.KB_EMBEDDINGS_PROVIDER || embeddingConfig.provider || 'openai';
  const probeQuery = process.env.SEMANTIC_READINESS_QUERY || 'semantic readiness probe';

  checks.push({
    name: 'Search policy mode',
    ok: true,
    detail: `semantic=${semanticPolicy}, hybrid=${hybridPolicy}, strictMode=${strictMode}`,
  });

  const providerReady =
    embeddingProvider !== 'openai' || Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  checks.push({
    name: 'Embedding provider credentials',
    ok: providerReady,
    detail: `provider=${embeddingProvider}`,
    remediation: providerReady
      ? undefined
      : 'Set OPENAI_API_KEY or configure KB_EMBEDDINGS_PROVIDER=mock/local for non-production probes.',
  });

  const vectorDb = new VectorDatabase('./atomized/embeddings/chroma');
  const endpoint = vectorDb.getEndpoint();

  let vectorsAvailable = false;
  let activeProfileId: string | undefined;
  let currentProfileId: string | undefined;
  try {
    await vectorDb.init();
    const stats = await vectorDb.getStats();
    vectorsAvailable = stats.totalVectors > 0;
    activeProfileId = stats.activeProfileId;
    currentProfileId = stats.currentProfileId;
    checks.push({
      name: 'Vector database connectivity',
      ok: true,
      detail: `endpoint=${endpoint}`,
    });
    checks.push({
      name: 'Vector index availability',
      ok: vectorsAvailable,
      detail: `totalVectors=${stats.totalVectors}, collection=${stats.collectionName}`,
      remediation: vectorsAvailable
        ? undefined
        : 'Generate embeddings and index vectors: npm run generate-embeddings -- --mode reindex --yes',
    });
    checks.push({
      name: 'Active vector profile parity',
      ok: stats.activeProfileId === stats.currentProfileId,
      detail: `active=${stats.activeProfileId}, current=${stats.currentProfileId}`,
      remediation:
        stats.activeProfileId === stats.currentProfileId
          ? undefined
          : 'Switch or rebuild profile: npm run generate-embeddings -- --mode switch --profile-id <id> --yes',
    });
    checks.push({
      name: 'Legacy vector fallback disabled',
      ok: !stats.usingLegacyCollection || !strictMode,
      detail: `usingLegacyCollection=${stats.usingLegacyCollection}`,
      remediation:
        !stats.usingLegacyCollection || !strictMode
          ? undefined
          : 'Strict mode forbids legacy fallback. Reindex active profile and switch pointer to profile collection.',
    });
  } catch (error) {
    checks.push({
      name: 'Vector database connectivity',
      ok: false,
      detail: `endpoint=${endpoint}, error=${error instanceof Error ? error.message : String(error)}`,
      remediation: 'Ensure Chroma is reachable (CHROMA_URL or CHROMA_HOST/CHROMA_PORT) and running.',
    });
  }

  const embeddingService = new EmbeddingsService();
  const embeddingProfile = embeddingService.getProfile();
  checks.push({
    name: 'Embedding profile',
    ok: true,
    detail: `profileId=${embeddingProfile.profileId}, model=${embeddingProfile.model}, dimensions=${embeddingProfile.dimensions}`,
  });

  if (currentProfileId && embeddingProfile.profileId !== currentProfileId) {
    checks.push({
      name: 'Embedding profile consistency',
      ok: false,
      detail: `resolved=${embeddingProfile.profileId}, vectorCurrent=${currentProfileId}`,
      remediation: 'Ensure runtime config/env for embedding provider/model matches vector runtime profile.',
    });
  }

  if (activeProfileId) {
    const activeVerification = await vectorDb.verifyProfileCollection(activeProfileId);
    checks.push({
      name: 'Active profile collection',
      ok: true,
      detail: `profile=${activeVerification.profileId}, vectors=${activeVerification.totalVectors}`,
    });
  }

  let embedding: number[] | null = null;
  if (providerReady) {
    try {
      embedding = await embeddingService.generateEmbedding(probeQuery);
      checks.push({
        name: 'Embedding generation',
        ok: embedding.length === embeddingProfile.dimensions,
        detail: `dimensions=${embedding.length}, expected=${embeddingProfile.dimensions}`,
        remediation:
          embedding.length === embeddingProfile.dimensions
            ? undefined
            : 'Embedding output dimensions do not match configured profile; verify provider/model settings.',
      });
    } catch (error) {
      checks.push({
        name: 'Embedding generation',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        remediation: 'Verify provider credentials/network and embedding model configuration.',
      });
    }
  }

  if (embedding && vectorsAvailable) {
    try {
      const semanticResults = await vectorDb.searchByEmbedding(embedding, 3);
      checks.push({
        name: 'Semantic vector query',
        ok: true,
        detail: `results=${semanticResults.length}`,
      });
    } catch (error) {
      checks.push({
        name: 'Semantic vector query',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        remediation: 'Confirm vector profile pointer, dimensions, and indexed embeddings are consistent.',
      });
    }
  }

  if (providerReady) {
    try {
      const hybrid = new HybridSearch('./db/knowledge.db', './atomized/embeddings/chroma');
      const results = await hybrid.search(probeQuery, 3, { fts: 0.4, semantic: 0.6 });
      checks.push({
        name: 'Hybrid search execution',
        ok: true,
        detail: `results=${results.length}, endpoint=${hybrid.getVectorEndpoint()}, profile=${hybrid.getVectorProfileId()}`,
      });
      hybrid.close();
    } catch (error) {
      checks.push({
        name: 'Hybrid search execution',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        remediation: 'Resolve vector DB connectivity/profile parity and embedding provider readiness before enabling strict semantic/hybrid.',
      });
    }
  }

  console.log('\nSemantic/Hybrid Readiness Report');
  console.log('--------------------------------');
  checks.forEach(emit);

  const failed = checks.filter(check => !check.ok);
  if (failed.length > 0) {
    console.log(`\nReadiness failed: ${failed.length} check(s) failed.`);
    process.exit(1);
  }

  console.log('\nReadiness passed: semantic/hybrid dependencies are production-ready.');
}

main().catch((error) => {
  console.error('Readiness script failed unexpectedly:', error);
  process.exit(1);
});
