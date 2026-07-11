/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * A model template within a provider template.
 * Maps directly to the `models[]` entries in chatLanguageModels.json.
 */
export interface IModelTemplate {
	/** Model identifier sent to the API (e.g., "gpt-4o", "claude-sonnet-4-20250514"). */
	readonly id: string;
	/** Display name shown in the VS Code model picker. */
	readonly name: string;
	/** Full endpoint URL for this model. */
	readonly url: string;
	/** Whether the model supports tool calling (required for agent mode). */
	readonly toolCalling: boolean;
	/** Whether the model supports image inputs. */
	readonly vision: boolean;
	/** Maximum input tokens the model accepts. */
	readonly maxInputTokens: number;
	/** Maximum output tokens the model generates. */
	readonly maxOutputTokens: number;
	/** Whether the model supports thinking/reasoning capabilities. */
	readonly thinking?: boolean;
	/** Whether the model supports streaming responses. */
	readonly streaming?: boolean;
}

/**
 * A provider template — the curated preset stored in our catalog.
 * When imported, this becomes a chatLanguageModels.json entry.
 */
export interface IProviderTemplate {
	/** Display name (e.g., "OpenAI", "Anthropic", "OpenCode"). */
	readonly name: string;
	/** VS Code vendor identifier. Most third-party providers use "customendpoint". */
	readonly vendor: string;
	/** API type: "chat-completions" | "responses" | "messages". */
	readonly apiType: string;
	/** Human-readable description of this provider. */
	readonly description: string;
	/** Instructions shown to the user for obtaining an API key. */
	readonly keyInstructions: string;
	/** URL to obtain an API key. */
	readonly keyUrl: string;
	/** Pre-configured models for this provider. */
	readonly models: readonly IModelTemplate[];
}

/**
 * A provider group as it appears in chatLanguageModels.json.
 * This is the runtime representation after import.
 */
export interface IChatLanguageModelEntry {
	/** Display name / group name (e.g., "OpenAI - Work"). */
	name: string;
	/** VS Code vendor identifier. */
	vendor: string;
	/** API type override at the provider level. */
	apiType?: string;
	/** API key — may be a plain string or a VS Code secret reference "${input:...}". */
	apiKey?: string;
	/** Model configurations. */
	models?: IChatLanguageModelModel[];
	/** VS Code internal range tracking (not user-facing). */
	range?: unknown;
	/** VS Code internal range tracking (not user-facing). */
	modelsRange?: unknown;
	/** Per-model settings (thinking effort, etc.). */
	settings?: Record<string, unknown>;
	/** Additional properties passthrough. */
	[key: string]: unknown;
}

/**
 * A single model entry within a provider group in chatLanguageModels.json.
 */
export interface IChatLanguageModelModel {
	id: string;
	name: string;
	url: string;
	apiType?: string;
	toolCalling?: boolean;
	vision?: boolean;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	thinking?: boolean;
	streaming?: boolean;
	[key: string]: unknown;
}
