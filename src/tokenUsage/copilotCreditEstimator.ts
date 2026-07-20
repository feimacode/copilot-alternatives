/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Estimated GitHub Copilot "AI credit" cost per model.
 *
 * GitHub does not expose actual per-request credit consumption through the
 * chat session store this extension parses (unlike a live OTel/debug-log
 * stream). These rates are a best-effort estimate reverse-engineered from
 * publicly observed Copilot billing behavior — NOT an authoritative source.
 * They will drift out of date as GitHub adjusts pricing; treat all values
 * derived from this table as "estimated AI credits", never exact.
 *
 * Rate unit: credits per 1,000,000 tokens. 1 credit ≈ $0.01 (informational
 * only — this extension never converts Copilot credits back to USD).
 */
export interface CopilotModelCreditRate {
	readonly inputCreditsPerMillion: number;
	readonly outputCreditsPerMillion: number;
	readonly cachedInputCreditsPerMillion?: number;
}

const DEFAULT_COPILOT_CREDIT_RATE: CopilotModelCreditRate = {
	inputCreditsPerMillion: 300,
	outputCreditsPerMillion: 1500,
	cachedInputCreditsPerMillion: 30,
};

/**
 * Known model → credit rate table. Keys are matched case-insensitively
 * against a normalized (lowercased, punctuation-stripped) model id/name.
 */
const COPILOT_MODEL_CREDIT_RATES: Record<string, CopilotModelCreditRate> = {
	// Anthropic
	'claudeopus4': { inputCreditsPerMillion: 500, outputCreditsPerMillion: 2500, cachedInputCreditsPerMillion: 50 },
	'claudesonnet4': { inputCreditsPerMillion: 300, outputCreditsPerMillion: 1500, cachedInputCreditsPerMillion: 30 },
	'claudesonnet45': { inputCreditsPerMillion: 300, outputCreditsPerMillion: 1500, cachedInputCreditsPerMillion: 30 },
	'claudehaiku45': { inputCreditsPerMillion: 100, outputCreditsPerMillion: 500, cachedInputCreditsPerMillion: 10 },
	// OpenAI
	'gpt5': { inputCreditsPerMillion: 250, outputCreditsPerMillion: 1000, cachedInputCreditsPerMillion: 125 },
	'gpt5mini': { inputCreditsPerMillion: 15, outputCreditsPerMillion: 60, cachedInputCreditsPerMillion: 7.5 },
	'gpt4o': { inputCreditsPerMillion: 250, outputCreditsPerMillion: 1000, cachedInputCreditsPerMillion: 125 },
	'gpt4omini': { inputCreditsPerMillion: 15, outputCreditsPerMillion: 60, cachedInputCreditsPerMillion: 7.5 },
	'o3': { inputCreditsPerMillion: 250, outputCreditsPerMillion: 1000, cachedInputCreditsPerMillion: 125 },
	'o3mini': { inputCreditsPerMillion: 15, outputCreditsPerMillion: 60, cachedInputCreditsPerMillion: 7.5 },
	// Google
	'gemini25pro': { inputCreditsPerMillion: 200, outputCreditsPerMillion: 1200, cachedInputCreditsPerMillion: 20 },
	'gemini25flash': { inputCreditsPerMillion: 150, outputCreditsPerMillion: 900, cachedInputCreditsPerMillion: 15 },
};

function normalizeModelKey(modelId: string): string {
	const stripped = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
	return stripped.toLowerCase().replace(/[-_.\s]/g, '');
}

function findCreditRate(modelId: string): CopilotModelCreditRate {
	const key = normalizeModelKey(modelId);
	if (COPILOT_MODEL_CREDIT_RATES[key]) { return COPILOT_MODEL_CREDIT_RATES[key]; }
	// Partial match: some model ids include extra suffixes (e.g. date stamps)
	for (const [rateKey, rate] of Object.entries(COPILOT_MODEL_CREDIT_RATES)) {
		if (key.startsWith(rateKey) || key.includes(rateKey)) { return rate; }
	}
	return DEFAULT_COPILOT_CREDIT_RATE;
}

/**
 * Estimates GitHub Copilot AI credits consumed by a single request.
 * This is a heuristic approximation — see module doc comment.
 */
export function estimateCopilotCredits(
	modelId: string,
	promptTokens: number,
	completionTokens: number,
	cachedTokens: number = 0,
): number {
	const rate = findCreditRate(modelId);
	const netInput = Math.max(0, promptTokens - cachedTokens);
	const inputCredits = (netInput / 1_000_000) * rate.inputCreditsPerMillion;
	const outputCredits = (completionTokens / 1_000_000) * rate.outputCreditsPerMillion;
	const cachedCredits = rate.cachedInputCreditsPerMillion !== undefined
		? (cachedTokens / 1_000_000) * rate.cachedInputCreditsPerMillion
		: 0;
	return inputCredits + outputCredits + cachedCredits;
}

/** Formats an AI credit amount for display (e.g. "128", "1.2K"). */
export function formatCredits(credits: number): string {
	if (credits < 1000) { return credits.toFixed(credits < 10 ? 1 : 0); }
	if (credits < 1_000_000) { return `${(credits / 1000).toFixed(1)}K`; }
	return `${(credits / 1_000_000).toFixed(2)}M`;
}
