
import { Router } from 'express';
import { getConfig, AppConfig } from './config.js';
import { AIFactory } from './ai-factory.js';

export function createConfigRoutes(): Router {
  const router = Router();
  const config = getConfig();

  // Get current configuration
  router.get('/', (req, res) => {
    try {
      const currentConfig = config.getAll();
      
      // Mask sensitive API keys for security
      const safeConfig = JSON.parse(JSON.stringify(currentConfig));
      if (safeConfig.llm?.apiKey) {
        safeConfig.llm.apiKey = '********'; // allow-secret
      }
      
      res.json({
        success: true,
        data: {
          config: safeConfig,
          env: {
            hasOpenAI: !!process.env.OPENAI_API_KEY,
            hasAnthropic: !!process.env.ANTHROPIC_API_KEY
          }
        }
      });
    } catch (error) {
      console.error('Failed to get config:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update configuration
  router.post('/', (req, res) => {
    try {
      const updates = req.body as Partial<AppConfig>;
      
      // Validate critical fields if necessary
      if (updates.llm?.provider && !['openai', 'anthropic', 'ollama', 'custom'].includes(updates.llm.provider)) {
        return res.status(400).json({ error: 'Invalid LLM provider' });
      }

      // Handle masked keys - don't overwrite with asterisks
      if (updates.llm?.apiKey === '********') { // allow-secret
        delete updates.llm.apiKey;
      }

      // Merge and save
      const current = config.getAll();
      
      // Deep merge for nested objects like 'llm'
      const mergedLLM = { ...current.llm, ...updates.llm };
      if (updates.llm) {
         config.set('llm', mergedLLM);
      }
      
      if (updates.embedding) {
          config.set('embedding', { ...current.embedding, ...updates.embedding });
      }

      // Save other top-level keys
      Object.keys(updates).forEach(key => {
        if (key !== 'llm' && key !== 'embedding') {
          config.set(key, updates[key]);
        }
      });

      config.save();
      
      res.json({ success: true, message: 'Configuration updated' });
    } catch (error) {
      console.error('Failed to update config:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  });

  // Test LLM Connection
  router.post('/test-llm', async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model } = req.body;
      
      const testProvider = AIFactory.createProvider(provider, {
        apiKey,
        baseUrl
      });

      const response = await testProvider.chat([{ role: 'user', content: 'Hello, are you working?' }], {
        model,
        maxTokens: 10
      });

      res.json({ success: true, response });
    } catch (error: any) {
      console.error('LLM Test Failed:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Connection failed' 
      });
    }
  });

  // List Models from Provider
  router.post('/models', async (req, res) => {
    try {
      const { provider, apiKey, baseUrl } = req.body;
      
      const testProvider = AIFactory.createProvider(provider, {
        apiKey,
        baseUrl
      });

      const models = await testProvider.getModels();
      res.json({ models });
    } catch (error: any) {
      console.warn('Failed to list models:', error.message);
      // Return empty list instead of 500, as some providers might fail
      res.json({ models: [] }); 
    }
  });

  return router;
}
