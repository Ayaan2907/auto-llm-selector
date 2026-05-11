// simply install the package,
// copy the file content
//touch sample.ts
// pass api key and run
// npx tsx sample.ts and check the output for quick understanding

// import {
//   AutoPromptRouter,
//   type RouterConfig,
//   type PromptProperties,
// } from './src/index.js';

import {
  AutoPromptRouter,
  type RouterConfig,
  type PromptProperties,
} from './src/index.js';

async function testAutoPromptRouter() {
  console.log('🚀 Testing Auto Prompt Router...\n');

  const config: RouterConfig = {
    OPEN_ROUTER_API_KEY: '',
    selectorModel: 'openai/gpt-oss-20b:free',
    enableLogging: true,
    analytics: {
      enabled: true,
      collectPromptMetrics: true,
      collectModelPerformance: true,
      collectSemanticFeatures: true,
      collectSystemInfo: true,
      batchSize: 3, // Small batch for testing
      batchIntervalMs: 3000, // 3 seconds for testing
      debugMode: true, // Verbose analytics logging
    },
  };

  try {
    // Initialize router
    console.log('📡 Initializing router...');
    const router = new AutoPromptRouter(config);
    await router.initialize();
    console.log('✅ Router initialized successfully\n');

    // Check analytics status
    console.log('📊 Analytics Status:', router.getAnalyticsStatus());

    // Test model profiles loading
    console.log('🔧 Loading model profiles...');
    const availableProfiles = await router.getAvailableModels();
    console.log(`✅ Loaded ${availableProfiles.length} model profiles\n`);

    // Show sample of model profiles
    if (availableProfiles.length > 0) {
      console.log('📋 Sample Model Profiles:');
      availableProfiles.slice(0, 3).forEach(profile => {
        console.log(`- ${profile.id}:`);
        console.log(
          `  Coding: ${(profile.capabilities.coding * 100).toFixed(0)}% | Creative: ${(profile.capabilities.creative * 100).toFixed(0)}% | Reasoning: ${profile.characteristics.isReasoning ? 'Yes' : 'No'}`
        );
        console.log(
          `  Speed: ${profile.characteristics.speedTier} | Cost: ${profile.characteristics.costTier} | Accuracy: ${profile.characteristics.accuracyTier}`
        );
      });
      console.log('');
    }

    // Test different scenarios
    const testCases = [
      {
        name: 'Coding Task',
        prompt:
          "Help me debug this Python function that's not working properly",
        properties: {
          accuracy: 0.9,
          cost: 0.4,
          speed: 0.6,
          tokenLimit: 4000,
          reasoning: true,
        },
      },
      {
        name: 'Creative Writing',
        prompt: 'Write a creative story about a time traveler',
        properties: {
          accuracy: 0.7,
          cost: 0.3,
          speed: 0.5,
          tokenLimit: 8000,
          reasoning: false,
        },
      },
      {
        name: 'Data Analysis',
        prompt:
          'Analyze this dataset and provide insights on customer behavior trends',
        properties: {
          accuracy: 0.95,
          cost: 0.6,
          speed: 0.4,
          tokenLimit: 6000,
          reasoning: true,
        },
      },
      {
        name: 'Quick Chat',
        prompt: 'Hi there! How are you doing today?',
        properties: {
          accuracy: 0.6,
          cost: 0.1,
          speed: 0.9,
          tokenLimit: 1000,
          reasoning: false,
        },
      },
      {
        name: 'Complex Reasoning',
        prompt:
          'Solve this logic puzzle: If all roses are flowers, and some flowers fade quickly, can we conclude that some roses fade quickly?',
        properties: {
          accuracy: 0.95,
          cost: 0.7,
          speed: 0.3,
          tokenLimit: 3000,
          reasoning: true,
        },
      },
    ];

    // Run test cases
    for (const testCase of testCases) {
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`📝 Prompt: "${testCase.prompt}"`);
      console.log(
        `⚙️  Properties:`,
        JSON.stringify(testCase.properties, null, 2)
      );

      try {
        const startTime = Date.now();
        const selection = await router.getModelRecommendation(
          testCase.prompt,
          testCase.properties as PromptProperties
        );
        const duration = Date.now() - startTime;

        console.log(`\n✅ RESULTS (${duration}ms):`);
        console.log(`🎯 Selected Model: ${selection.model}`);
        console.log(
          `📊 Selection Confidence: ${(selection.confidence * 100).toFixed(1)}%`
        );
        console.log(
          `🏷️  Classified Category: ${selection.category.type} (${(selection.category.confidence * 100).toFixed(1)}% confidence)`
        );
        console.log(`💡 Reasoning: ${selection.reason}`);
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error(`❌ Error for ${testCase.name}:`, error);
        if (error instanceof Error) {
          console.error('Stack:', error.stack);
        }
        console.log('='.repeat(80) + '\n');
      }
    }

    // Wait for analytics to flush
    console.log('⏳ Waiting 4 seconds for analytics to flush...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    console.log('📊 Final Analytics Status:', router.getAnalyticsStatus());

    // Graceful shutdown
    console.log('🔄 Shutting down router...');
    await router.shutdown();
    console.log('✅ Router shut down - analytics flushed to Supabase');
  } catch (error) {
    console.error('❌ Test failed:', error);

    if (
      error instanceof Error &&
      error.message.includes('OpenRouter API key')
    ) {
      console.log(
        '\n💡 Make sure to set your OPEN_ROUTER_API_KEY environment variable:'
      );
      console.log('export OPEN_ROUTER_API_KEY="your-actual-api-key"');
    }
  }
}

// Run the test
testAutoPromptRouter().catch(console.error);

export { testAutoPromptRouter };
