/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Per-model token pricing in USD per 1M tokens.
 * Used as fallback when the LM API does not supply pricing in model metadata.
 */
export interface ModelPricing {
	readonly inputPerMillion: number;
	readonly outputPerMillion: number;
	readonly cacheReadPerMillion?: number;
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

// ─── Static pricing tables ────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, ModelPricing> = {
	'gpt-4o':           { inputPerMillion: 2.50, outputPerMillion: 10.00 },
	'gpt-4o-mini':      { inputPerMillion: 0.15, outputPerMillion: 0.60 },
	'gpt-4.1':          { inputPerMillion: 2.00, outputPerMillion: 8.00 },
	'gpt-4.1-nano':     { inputPerMillion: 0.10, outputPerMillion: 0.40 },
	'gpt-4':            { inputPerMillion: 30.00, outputPerMillion: 60.00 },
	'claude-opus-4.6':  { inputPerMillion: 15.00, outputPerMillion: 75.00, cacheReadPerMillion: 3.75 },
	'claude-sonnet-4':  { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadPerMillion: 0.75 },
	'claude-sonnet-3.5':{ inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadPerMillion: 0.75 },
	'claude-3-5-haiku': { inputPerMillion: 0.80, outputPerMillion: 4.00, cacheReadPerMillion: 0.20 },
	'gemini-2.5-pro':   { inputPerMillion: 2.50, outputPerMillion: 10.00 },
	'gemini-2.5-flash': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
	'gemini-3.0-pro':   { inputPerMillion: 2.50, outputPerMillion: 10.00 },
	'gemini-3.0-flash': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
};

const MODEL_ENERGY: Record<string, ModelEnergy> = {
	'gpt-4o':           { inputWhPerToken: 0.00038,  outputWhPerToken: 0.0038 },
	'gpt-4o-mini':      { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
	'gpt-4.1':          { inputWhPerToken: 0.00035,  outputWhPerToken: 0.0035 },
	'gpt-4.1-nano':     { inputWhPerToken: 0.000040, outputWhPerToken: 0.00040 },
	'gpt-4':            { inputWhPerToken: 0.0010,   outputWhPerToken: 0.010 },
	'claude-opus-4.6':  { inputWhPerToken: 0.00080,  outputWhPerToken: 0.0080 },
	'claude-sonnet-4':  { inputWhPerToken: 0.00038,  outputWhPerToken: 0.0038 },
	'claude-sonnet-3.5':{ inputWhPerToken: 0.00038,  outputWhPerToken: 0.0038 },
	'claude-3-5-haiku': { inputWhPerToken: 0.00015,  outputWhPerToken: 0.0015 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 2.50, outputPerMillion: 10.00 };
const DEFAULT_ENERGY: ModelEnergy = { inputWhPerToken: 0.00038, outputWhPerToken: 0.0038 };
export const GRID_CARBON_INTENSITY_KG_PER_KWH = 0.39;

// ─── Model name resolution ───────────────────────────────────────────────────

/**
 * Resolve a model name to a pricing key via fuzzy matching.
 * Order matters: specific matches must come before general ones.
 */
export function resolveModelPricingKey(modelName: string): string {
	const lower = modelName.toLowerCase();
	if (MODEL_PRICING[modelName]) { return modelName; }

	if (lower.includes('claude') && lower.includes('opus')) { return 'claude-opus-4.6'; }
	if (lower.includes('claude') && lower.includes('sonnet') && (lower.includes('4') || lower.includes('3-7'))) { return 'claude-sonnet-4'; }
	if (lower.includes('claude') && lower.includes('haiku') && lower.includes('3-5')) { return 'claude-3-5-haiku'; }
	if (lower.includes('claude') && lower.includes('sonnet')) { return 'claude-sonnet-3.5'; }
	if (lower.includes('gpt-4o-mini')) { return 'gpt-4o-mini'; }
	if (lower.includes('gpt-4o')) { return 'gpt-4o'; }
	if (lower.includes('gpt-4.1-nano')) { return 'gpt-4.1-nano'; }
	if (lower.includes('gpt-4.1')) { return 'gpt-4.1'; }
	if (lower.includes('gpt-4')) { return 'gpt-4'; }
	if (lower.includes('gemini') && lower.includes('pro') && (lower.includes('2.5') || lower.includes('3'))) { return 'gemini-2.5-pro'; }
	if (lower.includes('gemini') && lower.includes('flash') && (lower.includes('2.5') || lower.includes('3'))) { return 'gemini-2.5-flash'; }
	if (lower.includes('gemini') && lower.includes('pro')) { return 'gemini-2.5-pro'; }
	if (lower.includes('gemini') && lower.includes('flash')) { return 'gemini-2.5-flash'; }

	return 'gpt-4o';
}

// ─── Cost / Energy estimation ────────────────────────────────────────────────

export function estimateCost(
	promptTokens: number,
	completionTokens: number,
	cachedTokens: number = 0,
	modelName: string = 'gpt-4o',
): CostEstimate {
	const pricing = MODEL_PRICING[resolveModelPricingKey(modelName)] || DEFAULT_PRICING;
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
	modelName: string = 'gpt-4o',
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
