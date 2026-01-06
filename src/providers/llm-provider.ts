/**
 * LLM Provider Abstraction
 * 
 * Interface commune pour tous les providers LLM (OpenAI, Anthropic, etc.)
 * Permet d'abstraire les différences entre providers et normaliser les réponses.
 */

/**
 * Requête normalisée pour générer une completion LLM
 */
export interface LLMRequest {
  /** Modèle à utiliser (ex: "gpt-4", "claude-3-opus") */
  model: string;
  
  /** Messages de la conversation */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  
  /** Tools disponibles pour le LLM (optionnel) */
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  
  /** Température pour la génération (optionnel) */
  temperature?: number;
  
  /** Nombre maximum de tokens à générer (optionnel) */
  maxTokens?: number;
  
  /** Settings par provider (pour FallbackProvider) - priorité sur temperature/maxTokens si fourni */
  providerSettings?: {
    openai?: { temperature?: number; maxTokens?: number };
    anthropic?: { temperature?: number; maxTokens?: number };
    default?: { temperature?: number; maxTokens?: number };
  };
  
  /** Signal d'annulation pour interrompre la requête (optionnel) */
  abortSignal?: AbortSignal;
}

/**
 * Réponse normalisée d'un provider LLM
 */
export interface LLMResponse {
  /** Contenu textuel de la réponse (null si tool calls uniquement) */
  content: string | null;
  
  /** Tool calls demandés par le LLM (optionnel) */
  toolCalls?: Array<{
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;
  
  /** Modèle utilisé pour générer la réponse */
  model: string;
  
  /** Usage des tokens (optionnel) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Interface commune pour tous les providers LLM
 * 
 * Cette interface abstrait les différences entre providers (OpenAI, Anthropic, etc.)
 * et normalise les formats de requête et réponse.
 */
export interface LLMProvider {
  /**
   * Génère une completion LLM selon la requête fournie
   * 
   * @param request - Requête normalisée LLMRequest
   * @returns Promise résolue avec réponse normalisée LLMResponse
   * @throws LLMProviderError en cas d'erreur du provider
   */
  generateCompletion(request: LLMRequest): Promise<LLMResponse>;
  
  /**
   * Vérifie si le provider supporte un modèle donné
   * 
   * @param model - Nom du modèle (ex: "gpt-4", "claude-3-opus")
   * @returns true si le modèle est supporté, false sinon
   */
  supportsModel(model: string): boolean;
  
  /**
   * Retourne le nom du provider (ex: "openai", "anthropic")
   * 
   * @returns Nom du provider
   */
  getProviderName(): string;
}

