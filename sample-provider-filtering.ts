// Sample demonstrating provider filtering functionality
// Run: npx tsx sample-provider-filtering.ts

import {
  AutoPromptRouter,
  type RouterConfig,
  type PromptProperties,
} from './src/index.js';

async function demonstrateProviderFiltering() {
  console.log('🚀 Demonstrating Provider Filtering Functionality...\n');

  // Note: You need to set OPEN_ROUTER_API_KEY environment variable
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    console.log('❌ Please set OPEN_ROUTER_API_KEY environment variable');
    console.log('Example: export OPEN_ROUTER_API_KEY="your-api-key"');
    return;
  }

  const testPrompt = 'Help me write a Python function to parse JSON data';
  const testProperties: PromptProperties = {
    accuracy: 0.8,
    cost: 0.5,
    speed: 0.6,
    tokenLimit: 4000,
    reasoning: true,
  };

  // Test different provider filtering scenarios
  const scenarios = [
    {
      name: 'No Provider Filtering (All Models)',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
      },
    },
    {
      name: 'Only OpenAI Models',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
        allowedProviders: ['openai'],
      },
    },
    {
      name: 'Only Anthropic Models',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
        allowedProviders: ['anthropic'],
      },
    },
    {
      name: 'OpenAI and Anthropic Only',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
        allowedProviders: ['openai', 'anthropic'],
      },
    },
    {
      name: 'Block Meta Llama Models',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
        blockedProviders: ['meta-llama'],
      },
    },
    {
      name: 'Block Free Models (Multiple Providers)',
      config: {
        OPEN_ROUTER_API_KEY: apiKey,
        selectorModel: 'openai/gpt-oss-20b:free',
        blockedProviders: ['gryphe', 'microsoft', 'nousresearch'],
      },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Scenario: ${scenario.name}`);
    console.log(`${'='.repeat(60)}`);
    
    if (scenario.config.allowedProviders) {
      console.log(`✅ Allowed Providers: [${scenario.config.allowedProviders.join(', ')}]`);
    }
    if (scenario.config.blockedProviders) {
      console.log(`❌ Blocked Providers: [${scenario.config.blockedProviders.join(', ')}]`);
    }
    
    try {
      console.log('\n📡 Initializing router...');
      const router = new AutoPromptRouter(scenario.config as RouterConfig);
      await router.initialize();
      
      console.log('📊 Loading available models...');
      const availableModels = await router.getAvailableModels();
      
      // Show provider distribution
      const providerCounts = availableModels.reduce((acc, model) => {
        const provider = model.characteristics.provider;
        acc[provider] = (acc[provider] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`\n📈 Available Models by Provider (Total: ${availableModels.length}):`);
      Object.entries(providerCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([provider, count]) => {
          console.log(`   ${provider}: ${count} models`);
        });
      
      console.log('\n🎯 Getting model recommendation...');
      const startTime = Date.now();
      const recommendation = await router.getModelRecommendation(testPrompt, testProperties);
      const duration = Date.now() - startTime;
      
      console.log(`\n✨ RECOMMENDATION (${duration}ms):`);
      console.log(`   🤖 Selected Model: ${recommendation.model}`);
      console.log(`   🏷️  Category: ${recommendation.category.type} (${(recommendation.category.confidence * 100).toFixed(1)}%)`);
      console.log(`   🎯 Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
      console.log(`   💡 Reason: ${recommendation.reason}`);
      
      // Extract provider from recommended model
      const selectedProvider = recommendation.model.split('/')[0];
      console.log(`   🏢 Provider: ${selectedProvider}`);
      
      // Validate the recommendation follows filtering rules
      if (scenario.config.allowedProviders) {
        const isAllowed = scenario.config.allowedProviders.includes(selectedProvider);
        console.log(`   ${isAllowed ? '✅' : '❌'} Provider filtering respected: ${isAllowed ? 'YES' : 'NO'}`);
      }
      if (scenario.config.blockedProviders) {
        const isBlocked = scenario.config.blockedProviders.includes(selectedProvider);
        console.log(`   ${!isBlocked ? '✅' : '❌'} Blocked provider avoided: ${!isBlocked ? 'YES' : 'NO'}`);
      }
      
    } catch (error) {
      console.error(`❌ Error in scenario "${scenario.name}":`, (error as Error).message);
      
      if ((error as Error).message.includes('No models available')) {
        console.log('💡 This is expected if the provider filtering is too restrictive');
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎉 Provider Filtering Demonstration Complete!');
  console.log(`${'='.repeat(60)}`);
  
  console.log('\n📚 Key Features Demonstrated:');
  console.log('✅ allowedProviders: Whitelist specific providers (e.g., only OpenAI)');
  console.log('✅ blockedProviders: Blacklist specific providers (e.g., exclude free models)');
  console.log('✅ Provider validation: Ensures filtered models respect constraints');
  console.log('✅ Error handling: Graceful failure when no models match filters');
  console.log('✅ Statistics: Shows model distribution by provider');
  
  console.log('\n💡 Usage Tips:');
  console.log('• allowedProviders takes priority over blockedProviders');
  console.log('• Provider names are case-insensitive (openai = OpenAI = OPENAI)');
  console.log('• Common providers: openai, anthropic, google, meta-llama, microsoft');
  console.log('• Use blockedProviders to avoid free/low-quality models');
  console.log('• Use allowedProviders for vendor lock-in or compliance requirements');
}

// Run the demonstration
demonstrateProviderFiltering().catch(console.error);