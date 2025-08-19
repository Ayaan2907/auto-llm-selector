// Core interfaces for the LLM router library

export interface PromptProperties {
    accuracy: number      // 0-1: How accurate the response needs to be
    cost: number         // 0-1: Cost sensitivity (0 = cost matters, 1 = cost doesn't matter)
    speed: number        // 0-1: Speed requirement (0 = slow ok, 1 = need fast)
    tokenLimit: number   // Maximum tokens needed for response
    reasoning: boolean   // Whether complex reasoning is required
}


export interface RouterConfig {
    OPEN_ROUTER_API_KEY: string
    // preferredProvider?: string  // e.g., "openai", "anthropic", "meta-llama"
    selectorModel?: string      // LLM model to use for selection decisions
    enableLogging?: boolean
}

    export interface ModelSelection {
        model: string
        reason: string
        confidence: number  // 0-1: How confident the selection is
        category: PromptCategory
    }

export enum PromptType {
    Creative = 'creative',
    Analytical = 'analytical', 
    Coding = 'coding',
    Conversational = 'conversational',
    Reasoning = 'reasoning',
    General = 'general'
}

export interface PromptCategory {
    type: PromptType
    confidence: number  // 0-1: Classification confidence
}

// Extended from your cache.ts ModelInfo to match OpenRouter API
export interface ModelInfo {
    id: string
    name: string
    description?: string
    context_length: number
    pricing: {
        prompt: string      // Price per token (as string from API)
        completion: string  // Price per token (as string from API)
    }
    top_provider: {
        max_completion_tokens?: number
        is_moderated: boolean
    }
}

// Processed model info for scoring
export interface ProcessedModel {
    id: string
    name: string
    description?: string
    contextLength: number
    promptCostPerToken: number    // Converted to number
    completionCostPerToken: number // Converted to number
    maxCompletionTokens?: number
    isModerated: boolean
    provider: string              // Extracted from model id
}

export interface ModelScore {
    model: ProcessedModel
    score: number        // 0-1: Overall score
    breakdown: {
        accuracy: number
        cost: number
        speed: number
        tokenLimit: number
        reasoning: number
    }
}

export interface ModelInfo {
    id: string;
    name: string;
    description?: string;
    context_length: number;
    pricing: {
      prompt: string;
      completion: string;
    };
    top_provider: {
      max_completion_tokens?: number;
      is_moderated: boolean;
    };
  }