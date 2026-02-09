import { SourceManager } from './sources/manager.js';
import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDatabase } from './database.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { KnowledgeItem, Conversation, KnowledgeDocument } from './types.js';
import { config } from 'dotenv';
import pRetry from 'p-retry';

config();

async function main() {
  console.log('👀 Starting Federated Knowledge Watcher...\n');
  
  const args = process.argv.slice(2);
  const withEmbeddings = args.includes('--with-embeddings');
  
  // Init components
  const manager = new SourceManager();
  const atomizer = new KnowledgeAtomizer();
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const markdownWriter = new MarkdownWriter('./atomized/markdown');
  const jsonWriter = new JSONWriter('./atomized/json');
  
  let vectorDb: VectorDatabase | null = null;
  let embeddingsService: EmbeddingsService | null = null;

  if (withEmbeddings) {
    embeddingsService = new EmbeddingsService();
    if (embeddingsService.getProfile().provider === 'openai' && !process.env.OPENAI_API_KEY) {
      console.warn('⚠️  Skipping embeddings: OPENAI_API_KEY not found for OpenAI embedding profile');
      embeddingsService = null;
    } else {
      vectorDb = new VectorDatabase('./atomized/embeddings/chroma', {
        embeddingProfile: embeddingsService.getProfile(),
        allowLegacyFallback: false,
      });
      await vectorDb.init();
      console.log('🔮 Embeddings enabled');
    }
  }

  // Debounce map to prevent rapid duplicate processing
  const processingQueue = new Map<string, NodeJS.Timeout>();

  const handleItem = async (item: KnowledgeItem) => {
    const id = item.id;
    
    // If already queued, clear the timeout (debounce)
    if (processingQueue.has(id)) {
      clearTimeout(processingQueue.get(id));
    }

    // Set a new timeout
    const timeout = setTimeout(async () => {
      processingQueue.delete(id);
      
      const sourceName = 'metadata' in item ? item.metadata?.sourceName : 'Unknown';
      console.log(`\n🔔 Change detected: ${item.title} (${sourceName})`);
      
      try {
        const units = await pRetry(
          async () => atomizer.atomize(item),
          {
            retries: 2,
            minTimeout: 250,
            factor: 2,
            onFailedAttempt: (err: any) => {
              console.warn(
                `   ⚠️  Atomization attempt ${err.attemptNumber} failed: ${err.message}`
              );
            },
          }
        );
        console.log(`   Split into ${units.length} atomic units`);

        // 2. Save to DB (safe to retry via INSERT OR REPLACE semantics)
        try {
          if ('messages' in item) {
            db.insertConversation(item as Conversation);
          } else {
            db.insertDocument(item as KnowledgeDocument);
          }
        } catch (e) {
          console.error('   ❌ Failed to persist source item:', e);
          return;
        }
        
        const unitsWithEmbeddings = [];

        for (const unit of units) {
          // 3. Generate Embeddings (if enabled)
          if (vectorDb && embeddingsService) {
            const text = embeddingsService.prepareText(`${unit.title}\n\n${unit.content}`);
            try {
                const [embedding] = await pRetry(
                  async () => embeddingsService!.generateEmbeddings([text]),
                  {
                    retries: 2,
                    minTimeout: 300,
                    factor: 2,
                    onFailedAttempt: (err: any) => {
                      console.warn(
                        `   ⚠️  Embedding attempt ${err.attemptNumber} failed for unit ${unit.id}: ${err.message}`
                      );
                    },
                  }
                );
                unit.embedding = embedding;
                unitsWithEmbeddings.push(unit);
            } catch (e) {
                console.error(`   ⚠️  Failed to generate embedding for unit ${unit.id}:`, e);
            }
          }

          try {
            db.insertAtomicUnit(unit);
          } catch (e) {
            console.error(`   ⚠️  Failed to insert unit ${unit.id}:`, e);
          }
        }

        // 4. Update Vector DB
        if (vectorDb && unitsWithEmbeddings.length > 0) {
           try {
               await vectorDb.addUnits(unitsWithEmbeddings, unitsWithEmbeddings.map(u => u.embedding!));
           } catch (e) {
               console.error('   ⚠️  Failed to update Vector DB:', e);
           }
        }

        // 5. Write Files
        markdownWriter.writeUnits(units);
        jsonWriter.writeUnits(units);
        jsonWriter.appendToJSONL(units);

        console.log('   ✅ Processed & Saved');

      } catch (e) {
        console.error('   ❌ Error processing item:', e);
      }
    }, 1000); // 1 second debounce

    processingQueue.set(id, timeout);
  };

  await manager.watchAll(handleItem);
  console.log('\n✅ Watchers active. Press Ctrl+C to stop.');
}

main();
