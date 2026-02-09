#!/usr/bin/env node
/**
 * Generate embeddings for atomic units and manage active vector profiles.
 */

import { config } from 'dotenv';
import { KnowledgeDatabase } from './database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';

config();

type EmbeddingMode = 'reindex' | 'verify' | 'switch';

function getArgValue(args: string[], flag: string, defaultValue?: string): string | undefined {
  const inline = args.find(arg => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.split('=').slice(1).join('=');
  }

  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }

  return defaultValue;
}

function parseMode(value: string | undefined): EmbeddingMode {
  const mode = (value || 'reindex').trim().toLowerCase();
  if (mode === 'reindex' || mode === 'verify' || mode === 'switch') {
    return mode;
  }
  throw new Error(`Invalid mode "${value}". Expected one of: reindex, verify, switch`);
}

async function runVerify(vectorDb: VectorDatabase, embeddingsService: EmbeddingsService): Promise<void> {
  const profile = embeddingsService.getProfile();
  const pointer = vectorDb.readActiveProfilePointer();
  const activeProfileId = pointer?.profileId || vectorDb.getActiveProfileId();
  const currentCollection = await vectorDb.verifyProfileCollection(profile.profileId);
  const activeCollection = await vectorDb.verifyProfileCollection(activeProfileId);

  console.log('🔍 Verification Summary');
  console.log(`  - Current profile: ${profile.profileId}`);
  console.log(`  - Active profile: ${activeProfileId}`);
  console.log(`  - Current collection: ${currentCollection.collectionName} (${currentCollection.totalVectors} vectors)`);
  console.log(`  - Active collection: ${activeCollection.collectionName} (${activeCollection.totalVectors} vectors)`);
  console.log(`  - Pointer file: ${vectorDb.getPointerPath()}`);

  if (activeProfileId !== profile.profileId) {
    throw new Error(
      `Active vector profile mismatch (active=${activeProfileId}, current=${profile.profileId}). ` +
      'Run switch mode or reindex mode.'
    );
  }
}

async function runSwitch(
  vectorDb: VectorDatabase,
  targetProfileId: string,
  requireConfirmation: boolean
): Promise<void> {
  if (!requireConfirmation) {
    console.log('⚠️ Switch mode updates active vector profile pointer.');
    console.log('   Re-run with --yes to confirm.');
    return;
  }

  const target = targetProfileId.trim();
  if (!target) {
    throw new Error('switch mode requires --profile-id=<profileId>');
  }

  const verification = await vectorDb.verifyProfileCollection(target);
  if (verification.totalVectors === 0) {
    throw new Error(
      `Target profile "${target}" has no vectors in ${verification.collectionName}. ` +
      'Run reindex mode before switching.'
    );
  }

  await vectorDb.switchActiveProfile(target, 'cli-switch');
  console.log(`✅ Switched active vector profile to ${target}`);
}

async function runReindex(
  db: KnowledgeDatabase,
  vectorDb: VectorDatabase,
  embeddingsService: EmbeddingsService,
  limit: number,
  requireConfirmation: boolean
): Promise<void> {
  const profile = embeddingsService.getProfile();
  console.log(`🧭 Target profile: ${profile.profileId} (${profile.model}, ${profile.dimensions} dims)`);

  if (!requireConfirmation) {
    console.log('⚠️ Reindex mode regenerates embeddings and replaces active profile collection data.');
    console.log('   Re-run with --yes to confirm.');
    return;
  }

  // Ensure writes happen against the same profile used by the embeddings service.
  await vectorDb.switchActiveProfile(profile.profileId, 'cli-reindex');
  await vectorDb.clearProfileCollection(profile.profileId);
  await vectorDb.switchActiveProfile(profile.profileId, 'cli-reindex');

  console.log('📊 Fetching atomic units from database...');
  const allUnits = db.getUnitsForGraph({ limit });
  if (allUnits.length === 0) {
    console.log('⚠️ No units found in database. Export some conversations first.');
    return;
  }

  console.log(`Found ${allUnits.length} atomic units`);

  const modelInfo = embeddingsService.getModelInfo();
  console.log('📐 Embedding Model:');
  console.log(`  - Model: ${modelInfo.model}`);
  console.log(`  - Provider: ${modelInfo.provider}`);
  console.log(`  - Dimensions: ${modelInfo.dimensions}`);
  console.log(`  - Profile ID: ${modelInfo.profileId}`);
  console.log(`  - Cost: ${modelInfo.cost}`);
  console.log('');

  // Estimate cost
  const avgChars = allUnits.reduce((sum, u) => sum + u.content.length + u.title.length, 0) / allUnits.length;
  const avgTokens = avgChars / 4; // Rough estimation
  const totalTokens = avgTokens * allUnits.length;
  const estimatedCost = (totalTokens / 1_000_000) * 0.02; // $0.02 per 1M tokens

  console.log('💰 Cost Estimate:');
  console.log(`  - Total tokens: ~${Math.round(totalTokens).toLocaleString()}`);
  console.log(`  - Estimated cost: $${estimatedCost.toFixed(4)}`);
  console.log('');

  const texts = allUnits.map(u =>
    embeddingsService.prepareText(`${u.title}\n\n${u.content}`)
  );

  console.log('🔮 Generating embeddings...');
  const startTime = Date.now();
  const embeddings = await embeddingsService.generateEmbeddings(texts);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`✅ Generated ${embeddings.length} embeddings in ${duration}s`);

  console.log('💾 Updating SQLite embedding payloads...');
  for (let i = 0; i < allUnits.length; i++) {
    allUnits[i].embedding = embeddings[i];
    db.insertAtomicUnit(allUnits[i]); // Updates existing rows
  }
  console.log('✅ SQLite database updated');

  console.log('🗄️ Writing vectors to ChromaDB...');
  await vectorDb.addUnits(allUnits, embeddings);

  const verification = await vectorDb.verifyProfileCollection(profile.profileId);
  const stats = await vectorDb.getStats();
  console.log(`✅ Active collection ${verification.collectionName}: ${verification.totalVectors} vectors`);
  console.log(`✅ Active profile pointer: ${stats.activeProfileId}`);
}

async function main(): Promise<void> {
  console.log('🔮 Embeddings Profile Management\n');

  const args = process.argv.slice(2);
  const mode = parseMode(getArgValue(args, '--mode', 'reindex'));
  const limitArg = getArgValue(args, '--limit', '100000') || '100000';
  const limit = Number.parseInt(limitArg, 10);
  const requireConfirmation = args.includes('--yes');
  const profileIdArg = getArgValue(args, '--profile-id');

  const db = new KnowledgeDatabase('./db/knowledge.db');
  const embeddingsService = new EmbeddingsService();
  const vectorDb = new VectorDatabase('./atomized/embeddings/chroma', {
    embeddingProfile: embeddingsService.getProfile(),
    allowLegacyFallback: false,
  });

  try {
    await vectorDb.init();

    if (mode === 'verify') {
      await runVerify(vectorDb, embeddingsService);
      console.log('\n✅ Verification passed.');
      return;
    }

    if (mode === 'switch') {
      await runSwitch(vectorDb, profileIdArg || '', requireConfirmation);
      if (requireConfirmation) {
        console.log('\n✅ Switch completed.');
      }
      return;
    }

    await runReindex(db, vectorDb, embeddingsService, limit, requireConfirmation);
    if (requireConfirmation) {
      console.log('\n🎉 Reindex completed.');
      console.log('Run `npm run readiness:semantic:strict` to validate strict production readiness.');
    }
  } catch (error) {
    console.error('\n❌ Embeddings workflow failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
