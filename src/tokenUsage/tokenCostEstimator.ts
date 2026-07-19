/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/**
 * Per-model token pricing in USD per 1M tokens.
 * Loaded from pricing.json at startup. Fields are optional; absent means
 * that price component is not applicable or unknown for this model.
 */
export interface ModelPricing {
	readonly inputPerMillion: number;
	readonly outputPerMillion: number;
	readonly cacheReadPerMillion?: number;
	readonly cacheWritePerMillion?: number;
	readonly inputLongPerMillion?: number;
	readonly outputLongPerMillion?: number;
	readonly cacheReadLongPerMillion?: number;
}

/**
 * Per-model energy consumption in Watt-hours per token.
 */
export interface ModelEnergy {
	readonly inputWhPerToken: number;
	readonly outputWhPerToken: number;
}

export interface CostEstimate {
	readonly inputCost: number;
	readonly outputCost: number;
	readonly cacheReadCost?: number;
	readonly totalCost: number;
}

export interface EnergyEstimate {
	readonly inputWh: number;
	readonly outputWh: number;
	readonly totalWh: number;
}

// ─── Raw row from pricing.json ────────────────────────────────────────────────

interface PricingRow {
	id: string;
	name: string;
	provider: string;
	pricing: {
		input: number;
		output: number;
		cacheHit?: number;
		cacheWrite?: number;
		inputLongContext?: number;
		outputLongContext?: number;
		cacheHitLongContext?: number;
	};
	copilotPricing?: {
		input: number;
		output: number;
		cacheHit?: number;
		cacheWrite?: number;
	};
}

interface PricingFile {
	models: PricingRow[];
}

// ─── Dynamically-loaded pricing table ─────────────────────────────────────────

let _pricingLoaded = false;
const _pricingMap: Record<string, ModelPricing> = {};
const _idByAlias: Record<string, string> = {};

/**
 * Resolve the path to pricing.json relative to the compiled output directory.
 * __dirname = out/tokenUsage/ → ../../data/pricing.json
 */
function _pricingJsonPath(): string {
	return path.resolve(__dirname, '..', '..', 'data', 'pricing.json');
}

/**
 * Load pricing data from pricing.json into the lookup maps.
 * Safe to call multiple times — the cache flag prevents redundant I/O.
 */
function _ensurePricingLoaded(): void {
	if (_pricingLoaded) { return; }

	try {
		const filePath = _pricingJsonPath();
		const raw = fs.readFileSync(filePath, 'utf8');
		const data: PricingFile = JSON.parse(raw);

		for (const model of data.models) {
			const p = model.pricing;
			const cp = model.copilotPricing;

			// Prefer copilotPricing when available (GitHub Copilot-specific rate)
			const src = cp ?? p;

			const m: ModelPricing = {
				inputPerMillion: src.input,
				outputPerMillion: src.output,
				...(src.cacheHit !== undefined && { cacheReadPerMillion: src.cacheHit }),
				...(src.cacheWrite !== undefined && { cacheWritePerMillion: src.cacheWrite }),
				...(p.inputLongContext !== undefined && { inputLongPerMillion: p.inputLongContext }),
				...(p.outputLongContext !== undefined && { outputLongPerMillion: p.outputLongContext }),
				...(p.cacheHitLongContext !== undefined && { cacheReadLongPerMillion: p.cacheHitLongContext }),
			};

			_pricingMap[model.id] = m;

			// Build alias map for fuzzy matching: lowercase id without special chars
			const alias = model.id.toLowerCase().replace(/[-_.\s]/g, '');
			_idByAlias[alias] = model.id;
		}

		_pricingLoaded = true;
		console.log(`[TokenCostEstimator] loaded ${Object.keys(_pricingMap).length} models from pricing.json`);
	} catch (err) {
		console.error('[TokenCostEstimator] failed to load pricing.json, using fallback:', err);
	}
}

const MODEL_ENERGY: Record<string, ModelEnergy> = {
	'gpt-5.4': { inputWhPerToken: 0.00038, outputWhPerToken: 0.0038 },
	'gpt-5.4-mini': { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
	'gpt-5.4-nano': { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
	'gpt-5-mini': { inputWhPerToken: 0.000030, outputWhPerToken: 0.00030 },
	'gpt-5.5': { inputWhPerToken: 0.00050, outputWhPerToken: 0.0050 },
	'gpt-5.6-sol': { inputWhPerToken: 0.00060, outputWhPerToken: 0.0060 },
	'gpt-5.6-terra': { inputWhPerToken: 0.00045, outputWhPerToken: 0.0045 },
	'gpt-5.6-luna': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'gpt-5.3-codex': { inputWhPerToken: 0.00040, outputWhPerToken: 0.0040 },
	'claude-haiku-4-5': { inputWhPerToken: 0.00015, outputWhPerToken: 0.0015 },
	'claude-sonnet-4':  { inputWhPerToken: 0.00038,  outputWhPerToken: 0.0038 },
	'claude-sonnet-4-5': { inputWhPerToken: 0.00038, outputWhPerToken: 0.0038 },
	'claude-sonnet-4-6': { inputWhPerToken: 0.00038, outputWhPerToken: 0.0038 },
	'claude-sonnet-5': { inputWhPerToken: 0.00032, outputWhPerToken: 0.0032 },
	'claude-opus-4-5': { inputWhPerToken: 0.00080, outputWhPerToken: 0.0080 },
	'claude-opus-4-6': { inputWhPerToken: 0.00080, outputWhPerToken: 0.0080 },
	'claude-opus-4-7': { inputWhPerToken: 0.00080, outputWhPerToken: 0.0080 },
	'claude-opus-4-8': { inputWhPerToken: 0.00080, outputWhPerToken: 0.0080 },
	'claude-fable-5': { inputWhPerToken: 0.00100, outputWhPerToken: 0.0100 },
	'gemini-2.5-pro': { inputWhPerToken: 0.00050, outputWhPerToken: 0.0050 },
	'gemini-2.5-flash': { inputWhPerToken: 0.00015, outputWhPerToken: 0.0015 },
	'gemini-2.5-flash-lite': { inputWhPerToken: 0.000060, outputWhPerToken: 0.00060 },
	'gemini-3-flash': { inputWhPerToken: 0.00015, outputWhPerToken: 0.0015 },
	'gemini-3.1-pro-preview': { inputWhPerToken: 0.00055, outputWhPerToken: 0.0055 },
	'gemini-3.5-flash': { inputWhPerToken: 0.00012, outputWhPerToken: 0.0012 },
	'deepseek-v4-flash': { inputWhPerToken: 0.000080, outputWhPerToken: 0.00080 },
	'deepseek-v4-pro': { inputWhPerToken: 0.00020, outputWhPerToken: 0.0020 },
	'grok-4.5': { inputWhPerToken: 0.00060, outputWhPerToken: 0.0060 },
	'glm-5': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'glm-5.1': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'glm-5.2': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'glm-5-turbo': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'glm-4.7': { inputWhPerToken: 0.00030, outputWhPerToken: 0.0030 },
	'kimi-k3': { inputWhPerToken: 0.00055, outputWhPerToken: 0.0055 },
	'kimi-k2.7-code': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'kimi-k2.6': { inputWhPerToken: 0.00035, outputWhPerToken: 0.0035 },
	'qwen3.7-max': { inputWhPerToken: 0.00050, outputWhPerToken: 0.0050 },
	'qwen3.7-plus': { inputWhPerToken: 0.00030, outputWhPerToken: 0.0030 },
	'qwen3.6-plus': { inputWhPerToken: 0.00030, outputWhPerToken: 0.0030 },
	'minimax-m3': { inputWhPerToken: 0.00030, outputWhPerToken: 0.0030 },
	'minimax-m2.7': { inputWhPerToken: 0.00030, outputWhPerToken: 0.0030 },
	'mimo-v2.5': { inputWhPerToken: 0.000080, outputWhPerToken: 0.00080 },
	'mimo-v2.5-pro': { inputWhPerToken: 0.00020, outputWhPerToken: 0.0020 },
	'raptor-mini': { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
	'mai-code-1-flash': { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 2.50, outputPerMillion: 10.00 };
const DEFAULT_ENERGY: ModelEnergy = { inputWhPerToken: 0.00038, outputWhPerToken: 0.0038 };
export const GRID_CARBON_INTENSITY_KG_PER_KWH = 0.39;

// ─── Model name resolution ───────────────────────────────────────────────────

/**
 * Resolve a model name to a pricing key (model id in pricing.json).
 * First checks exact match, then falls back to fuzzy alias matching.
 */
export function resolveModelPricingKey(modelName: string): string {
	_ensurePricingLoaded();

	// Exact match (most common case)
	if (_pricingMap[modelName]) { return modelName; }

	// Fuzzy match via aliases
	const normalized = modelName.toLowerCase().replace(/[-_.\s]/g, '');
	if (_idByAlias[normalized]) { return _idByAlias[normalized]; }

	// Provider/vendor prefixes — strip them and try again
	const stripped = modelName.includes('/') ? modelName.split('/').pop()! : modelName;
	const strippedAlias = stripped.toLowerCase().replace(/[-_.\s]/g, '');
	if (_idByAlias[strippedAlias]) { return _idByAlias[strippedAlias]; }

	// Fallback to generic gpt-4o
	return 'gpt-5.4';
}

// ─── Cost / Energy estimation ────────────────────────────────────────────────

export function estimateCost(
	promptTokens: number,
	completionTokens: number,
	cachedTokens: number = 0,
	modelName: string = 'gpt-5.4',
): CostEstimate {
	_ensurePricingLoaded();

	const pricing = _pricingMap[resolveModelPricingKey(modelName)] || DEFAULT_PRICING;
	const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
	const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
	let cacheReadCost: number | undefined;
	if (cachedTokens > 0 && pricing.cacheReadPerMillion !== undefined) {
		cacheReadCost = (cachedTokens / 1_000_000) * pricing.cacheReadPerMillion;
	}
	return { inputCost, outputCost, cacheReadCost, totalCost: inputCost + outputCost + (cacheReadCost ?? 0) };
}

export function estimateEnergy(
	promptTokens: number,
	completionTokens: number,
	modelName: string = 'gpt-5.4',
): EnergyEstimate {
	const energy = MODEL_ENERGY[resolveModelPricingKey(modelName)] || DEFAULT_ENERGY;
	return {
		inputWh: promptTokens * energy.inputWhPerToken,
		outputWh: completionTokens * energy.outputWhPerToken,
		totalWh: (promptTokens * energy.inputWhPerToken) + (completionTokens * energy.outputWhPerToken),
	};
}

export function estimateCO2Grams(wattHours: number): number {
	return (wattHours / 1000) * GRID_CARBON_INTENSITY_KG_PER_KWH * 1000;
}

// ─── Display formatting ──────────────────────────────────────────────────────

export function formatTokenCount(tokens: number): string {
	if (tokens < 1000) { return tokens.toString(); }
	if (tokens < 1_000_000) { return `${(tokens / 1000).toFixed(1)}K`; }
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function formatCost(cost: number): string {
	if (cost < 0.01) { return `$${cost.toFixed(4)}`; }
	if (cost < 1) { return `$${cost.toFixed(3)}`; }
	return `$${cost.toFixed(2)}`;
}

export function formatEnergy(wattHours: number): string {
	if (wattHours < 0.001) { return `${(wattHours * 1000).toFixed(2)} mWh`; }
	if (wattHours < 1000) { return `${wattHours.toFixed(2)} Wh`; }
	return `${(wattHours / 1000).toFixed(2)} kWh`;
}

export function formatCO2(grams: number): string {
	if (grams < 1) { return `${(grams * 1000).toFixed(0)} mg`; }
	if (grams < 1000) { return `${grams.toFixed(1)} g`; }
	return `${(grams / 1000).toFixed(2)} kg`;
}

export function formatCostCompact(cost: number): string {
	if (cost < 0.01) { return `$${cost.toFixed(3)}`; }
	if (cost < 1000) { return `$${cost.toFixed(2)}`; }
	if (cost < 1_000_000) { return `$${(cost / 1000).toFixed(1)}K`; }
	return `$${(cost / 1_000_000).toFixed(1)}M`;
}
