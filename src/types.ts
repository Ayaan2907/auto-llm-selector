// Core interfaces for the LLM router library

export interface PromptProperties {
  accuracy: number; // 0-1: How accurate the response needs to be
  cost: number; // 0-1: Cost sensitivity (0 = cost matters, 1 = cost doesn't matter)
  speed: number; // 0-1: Speed requirement (0 = slow ok, 1 = need fast)
  tokenLimit: number; // Maximum tokens needed for response
  reasoning: boolean; // Whether complex reasoning is required
}

export interface AnalyticsConfig {
  enabled: boolean; // Master switch - MUST be explicitly enabled
  collectPromptMetrics: boolean; // Prompt classification, features (hashed only)
  collectModelPerformance: boolean; // Model selection, confidence, response times
  collectSemanticFeatures: boolean; // Embedding metrics, classification data
  collectSystemInfo: boolean; // Platform, Node version (anonymized)
  batchSize?: number; // Events per batch upload (default: 50)
  batchIntervalMs?: number; // Max time before batch upload (default: 5000)
  debugMode?: boolean; // Verbose analytics logging (default: false)
}

export interface RouterConfig {
  OPEN_ROUTER_API_KEY: string;
  // preferredProvider?: string  // e.g., "openai", "anthropic", "meta-llama"
  selectorModel?: string; // LLM model to use for selection decisions
  enableLogging?: boolean;
  analytics?: AnalyticsConfig; // Optional analytics configuration

}

export interface ModelSelection {
  model: string;
  reason: string;
  confidence: number; // 0-1: How confident the selection is
  category: PromptCategory;
}

export enum PromptType {
  Creative = 'creative',
  Analytical = 'analytical',
  Coding = 'coding',
  Conversational = 'conversational',
  Reasoning = 'reasoning',
  General = 'general',
}

export interface PromptCategory {
  type: PromptType;
  confidence: number; // 0-1: Classification confidence
}

// Extended from your cache.ts ModelInfo to match OpenRouter API
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string; // Price per token (as string from API)
    completion: string; // Price per token (as string from API)
  };
  top_provider: {
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
}

// Processed model info for scoring
export interface ProcessedModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  promptCostPerToken: number; // Converted to number
  completionCostPerToken: number; // Converted to number
  maxCompletionTokens?: number;
  isModerated: boolean;
  provider: string; // Extracted from model id
}

export interface ModelScore {
  model: ProcessedModel;
  score: number; // 0-1: Overall score
  breakdown: {
    accuracy: number;
    cost: number;
    speed: number;
    tokenLimit: number;
    reasoning: number;
  };
}

// Model profiling interfaces
export interface ModelCapabilities {
  coding: number; // 0-1: Coding task performance
  creative: number; // 0-1: Creative writing ability
  analytical: number; // 0-1: Data analysis capability
  reasoning: number; // 0-1: Logical reasoning strength
  conversational: number; // 0-1: Chat/dialogue quality
  general: number; // 0-1: General knowledge tasks
}

export interface ModelCharacteristics {
  speedTier: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  costTier: 'free' | 'cheap' | 'moderate' | 'expensive' | 'premium';
  accuracyTier: 'basic' | 'good' | 'high' | 'excellent';
  contextTier: 'small' | 'medium' | 'large' | 'huge';
  provider: string;
  modelFamily: string; // e.g., 'gpt-4', 'claude-3', 'gemini'
  isReasoning: boolean; // Has chain-of-thought/reasoning capabilities
  isMultimodal: boolean; // Supports images/other modalities
}

export interface ModelProfile {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapabilities;
  characteristics: ModelCharacteristics;
  contextLength: number;
  promptCostPerToken: number;
  completionCostPerToken: number;
  maxCompletionTokens?: number;
  isModerated: boolean;
  profileConfidence: number; // 0-1: How confident we are in this profile
}

export interface CategoryModelRanking {
  category: PromptType;
  rankedModels: {
    model: ModelProfile;
    score: number;
    reasoning: string;
  }[];
}

// Analytics event interfaces
export interface AnalyticsEvent {
  eventType: string;
  timestamp: number;
  sessionId: string;
  libraryVersion: string;
  data: Record<string, unknown>;
}

export interface PromptAnalyticsData {
  promptHash: string;
  promptLength: number;
  promptType: PromptType;
  classificationConfidence: number;
  semanticConfidence?: number;
  keywordConfidence?: number;
  modelSelected: string;
  selectionConfidence: number;
  responseTimeMs: number;
  systemInfo?: Record<string, unknown>;
  [key: string]: unknown;
}
