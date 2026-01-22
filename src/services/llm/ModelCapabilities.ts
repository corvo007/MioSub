/**
 * Model Capabilities Service
 *
 * Provides model lookup, fuzzy matching, and capability parsing
 * based on models.json (OpenRouter API data).
 */

const modelsData = require('@/config/models.json');

// =============================================================================
// Types
// =============================================================================

export interface ModelEntry {
  id: string;
  name: string;
  created: number;
  context_length: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    max_completion_tokens?: number | null;
  };
  supported_parameters?: string[];
}

export type JsonOutputLevel = 'strict' | 'json_mode' | 'none';

export interface ModelCapabilities {
  id: string;
  jsonOutputLevel: JsonOutputLevel;
  reasoning: boolean;
  audioInput: boolean;
  contextLength: number;
  maxOutputTokens: number | null;
}

export interface ModelMatchResult {
  status: 'exact' | 'fuzzy' | 'not_found';
  model?: ModelEntry;
  confidence: number;
  suggestions?: string[];
  warning?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Provider prefix mapping for normalization */
const PROVIDER_PREFIXES: Record<string, string> = {
  'gpt-': 'openai/',
  'o1-': 'openai/',
  'o3-': 'openai/',
  'o4-': 'openai/',
  'claude-': 'anthropic/',
  'gemini-': 'google/',
};

// =============================================================================
// Model Lookup
// =============================================================================

const models: ModelEntry[] = (modelsData as { data: ModelEntry[] }).data;
const modelMap = new Map<string, ModelEntry>(models.map((m) => [m.id, m]));

/**
 * Normalize model name by cleaning and adding provider prefix
 */
function normalizeModelName(input: string): string {
  // Remove common prefixes like "(特价)" or marketing text
  let cleaned = input.replace(/^(\([^)]+\)|\[[^\]]+\])\s*/, '').trim();

  // Check if already has provider prefix
  if (cleaned.includes('/')) {
    return cleaned;
  }

  // Add provider prefix based on model name
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (cleaned.startsWith(prefix)) {
      return provider + cleaned;
    }
  }

  return cleaned;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Get common prefix length between two strings
 */
function getCommonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

/**
 * Find suggestion candidates based on similarity
 */
function findSuggestions(input: string, limit = 3): string[] {
  const normalized = normalizeModelName(input).toLowerCase();
  const scores: Array<{ id: string; score: number }> = [];

  for (const model of models) {
    const shortName = model.id.split('/').pop()!.toLowerCase();
    let score = 0;

    // Substring match bonus
    if (shortName.includes(normalized) || normalized.includes(shortName)) {
      score += 50;
    }

    // Levenshtein distance (smaller is better)
    const distance = levenshtein(normalized, shortName);
    score += Math.max(0, 30 - distance * 5);

    // Common prefix bonus
    const commonPrefix = getCommonPrefixLength(normalized, shortName);
    score += commonPrefix * 3;

    if (score > 10) {
      scores.push({ id: model.id, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id);
}

/**
 * Find a model by ID with fuzzy matching and suggestions
 */
export function findModel(input: string): ModelMatchResult {
  const trimmed = input.trim();

  // 1. Exact match
  const exact = modelMap.get(trimmed);
  if (exact) {
    return { status: 'exact', model: exact, confidence: 1.0 };
  }

  // 2. Normalized match
  const normalized = normalizeModelName(trimmed);
  const normalizedMatch = modelMap.get(normalized);
  if (normalizedMatch) {
    return {
      status: 'fuzzy',
      model: normalizedMatch,
      confidence: 0.95,
      warning: `已自动匹配到 ${normalizedMatch.id}`,
    };
  }

  // 3. Suffix match (user input without provider prefix)
  for (const [id, model] of modelMap) {
    if (id.endsWith('/' + trimmed)) {
      return {
        status: 'fuzzy',
        model,
        confidence: 0.9,
        warning: `已自动匹配到 ${id}`,
      };
    }
  }

  // 4. Partial match (find best containing match, prefer newer models)
  const partialMatches = models
    .filter((m) => m.id.toLowerCase().includes(trimmed.toLowerCase()))
    .sort((a, b) => b.created - a.created);

  if (partialMatches.length > 0) {
    const best = partialMatches[0];
    return {
      status: 'fuzzy',
      model: best,
      confidence: 0.8,
      warning: `已自动匹配到 ${best.id}`,
      suggestions: partialMatches.slice(0, 3).map((m) => m.id),
    };
  }

  // 5. Not found, provide suggestions
  const suggestions = findSuggestions(trimmed);
  return {
    status: 'not_found',
    confidence: 0,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    warning: `未找到模型 "${trimmed}"`,
  };
}

// =============================================================================
// Capability Parsing
// =============================================================================

/**
 * Get JSON output level from supported parameters
 */
export function getJsonOutputLevel(params: string[]): JsonOutputLevel {
  if (params.includes('structured_outputs')) return 'strict';
  if (params.includes('response_format')) return 'json_mode';
  return 'none';
}

/**
 * Check if model supports reasoning/thinking
 */
export function hasReasoningCapability(params: string[]): boolean {
  return params.includes('reasoning') || params.includes('include_reasoning');
}

/**
 * Parse all capabilities from a model entry
 */
export function parseCapabilities(model: ModelEntry): ModelCapabilities {
  const params = model.supported_parameters ?? [];
  return {
    id: model.id,
    jsonOutputLevel: getJsonOutputLevel(params),
    reasoning: hasReasoningCapability(params),
    audioInput: model.architecture?.input_modalities?.includes('audio') ?? false,
    contextLength: model.context_length,
    maxOutputTokens: model.top_provider?.max_completion_tokens ?? null,
  };
}

/**
 * Get capabilities for a model by ID (with fuzzy matching)
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  const result = findModel(modelId);
  if (result.model) {
    return parseCapabilities(result.model);
  }
  return null;
}

/**
 * Get model entry by ID (with fuzzy matching)
 */
export function getModelEntry(modelId: string): ModelEntry | null {
  const result = findModel(modelId);
  return result.model ?? null;
}
