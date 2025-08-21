import { Logger } from "./utils/logger.js";
import { modelCache } from "./cache.js";
import { PromptClassifier } from "./classifier.js";
import type { RouterConfig, PromptProperties, ModelSelection, ProcessedModel, PromptCategory } from "./types.js";

export class AutoPromptRouter {
    private logger: Logger;
    private config: RouterConfig;
    private isInitialized: boolean = false;

    constructor(config: RouterConfig) {
        this.config = {
            selectorModel: "openai/gpt-oss-20b:free",
            enableLogging: false,
            ...config
        };
        
        this.logger = new Logger("AutoPromptRouter");

        // Set environment variables for cache to use
        process.env.OPEN_ROUTER_API_KEY = this.config.OPEN_ROUTER_API_KEY;
    }

    /**
     * Initialize the router by fetching and caching model data
     */
    async initialize(): Promise<void> {
        try {
            this.logger.info("Initializing AutoPromptRouter");
            
            // Pre-fetch and cache models
            await modelCache.getModels();
            
            this.isInitialized = true;
            this.logger.info("AutoPromptRouter initialized successfully");
            
        } catch (error) {
            this.logger.error("Failed to initialize AutoPromptRouter", error);
            throw new Error("Failed to initialize router. Please check your OpenRouter API key.");
        }
    }

    /**
     * Get model recommendation for a prompt
     */
    async getModelRecommendation(
        prompt: string, 
        properties: PromptProperties
    ): Promise<ModelSelection> {
        if (!this.isInitialized) {
            throw new Error("Router not initialized. Call initialize() first.");
        }

        this.logger.info("Getting model recommendation", { 
            promptLength: prompt.length,
            properties 
        });

        try {
            // Step 1: Get processed models
            const processedModels = await this.getAvailableModels();
            
            // Step 2: Basic filtering (only keep models that can handle token requirements)
            const suitableModels = processedModels.filter(model => 
                model.contextLength >= properties.tokenLimit
            );
            // TODO: Add more filtering based on properties, provider, semantics
            
            // Step 3: Let LLM make intelligent selection from all suitable models
            const finalSelection = await this.getLLMDecision(prompt, properties, suitableModels);
            
            this.logger.info("Model recommendation generated", { finalSelection });
            return finalSelection;
            
        } catch (error) {
            this.logger.error("Failed to get model recommendation", error);
            throw new Error("Failed to generate model recommendation");
        }
    }

    /**
     * Get available models (for debugging/inspection)
     */
    async getAvailableModels(): Promise<ProcessedModel[]> {
        const models = await modelCache.getModels();
        return models.map(this.processModel);
    }

    /**
     * Clear model cache
     */
    clearCache(): void {
        modelCache.clearCache();
        this.logger.info("Model cache cleared");
    }

    // Private methods 
    private async classifyPrompt(prompt: string): Promise<PromptCategory> {
        return PromptClassifier.classifyPrompt(prompt);
    }

    private async getLLMDecision(
        prompt: string,
        properties: PromptProperties,
        suitableModels: ProcessedModel[]
    ): Promise<ModelSelection> {
        // Prepare model information for LLM
        const modelInfo = suitableModels.map(model => ({
            id: model.id,
            name: model.name,
            description: model.description,
            contextLength: model.contextLength,
            promptCost: model.promptCostPerToken,
            completionCost: model.completionCostPerToken,
            provider: model.provider
        }));

        // Create prompt for LLM to make selection
        const selectionPrompt = `You are an expert in selecting the best LLM for a given prompt. 

Given the following user prompt, select the best LLM for this prompt based on the following criteria and the preferences of the user:

<criteria>
Category of prompt,
Accuracy,
Cost,
Speed,
Token Limit,
Reasoning Enabled,
</criteria>

USER PROMPT: "${prompt}"

REQUIREMENTS:
- Accuracy importance: ${properties.accuracy}/1 (higher = more important)
- Cost sensitivity: ${properties.cost}/1 (lower = more cost-sensitive)  
- Speed requirement: ${properties.speed}/1 (higher = faster needed)
- Token limit needed: ${properties.tokenLimit}
- Needs reasoning: ${properties.reasoning}

<models_available>
${modelInfo.map(m => `${m.id}: ${m.name} - ${m.description || 'No description available'} (Context: ${m.contextLength}, Cost: $${m.promptCost}/$${m.completionCost} per token, Provider: ${m.provider})`).join('\n\n')}
</models_available>

You must respond with valid JSON in this EXACT format:
{
  "model": "exact_model_id_from_list",
  "reason": "brief explanation of why this model was selected",
  "confidence": 0.85
}

Important: The "model" field must exactly match one of the model IDs from the list above. and in response i do not want any extra char like \`\`\` json or any other char`;

        try {
            // Make API call to selector model
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.config.selectorModel,
                    messages: [{ role: "user", content: selectionPrompt }],
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                throw new Error(`LLM selection failed: ${response.status}`);
            }

            const data = await response.json() as any;
            const llmResponse = data.choices[0].message.content;
            
            // Parse LLM response
            const selection = JSON.parse(llmResponse);
            
            // Classify the prompt for category
            const category = await this.classifyPrompt(prompt);
            
            return {
                model: selection.model,
                reason: selection.reason,
                confidence: selection.confidence,
                category
            };

        } catch (error) {
            this.logger.error("LLM decision failed, falling back to first suitable model", error);
            
            // Fallback to first suitable model
            if (suitableModels.length === 0) {
                throw new Error("No suitable models found for the given requirements");
            }
            
            const fallbackModel = suitableModels[0];
            const category = await this.classifyPrompt(prompt);
            
            return {
                model: fallbackModel?.id || "",
                reason: `Fallback selection: ${fallbackModel?.name} (LLM selection failed)`,
                confidence: 0.5,
                category
            };
        }
    }


    private processModel(model: any): ProcessedModel {
        return {
            id: model.id,
            name: model.name,
            description: model.description,
            contextLength: model.context_length,
            promptCostPerToken: parseFloat(model.pricing.prompt),
            completionCostPerToken: parseFloat(model.pricing.completion),
            maxCompletionTokens: model.top_provider.max_completion_tokens,
            isModerated: model.top_provider.is_moderated,
            provider: model.id.split('/')[0] || 'unknown'
        };
    }
}