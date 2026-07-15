/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../platform/log/common/logService';

// ─── Heuristic inference (fallback) ──────────────────────────────────────────

/**
 * Heuristic vendor inference from model name.
 * Used as fallback when the model ID has no vendor prefix.
 * Order matters: more specific patterns first.
 */
function heuristicInferVendor(model: string): string | undefined {
	const lower = model.toLowerCase();
	if (lower.includes('claude')) { return 'anthropic'; }
	if (lower.includes('gpt')) { return 'openai'; }
	if (lower.includes('gemini')) { return 'google'; }
	if (lower.includes('deepseek')) { return 'deepseek'; }
	if (lower.includes('glm')) { return 'zhipu'; }
	if (lower.startsWith('copilot/')) { return 'copilot'; }
	return undefined;
}

// ─── Exported resolver ──────────────────────────────────────────────────────

/**
 * Resolves a vendor name for a given model name.
 *
 * Priority order:
 *
 * 1. **Model ID prefix** — If the model ID contains a `/` separator,
 *    the part before the first `/` IS the vendor.
 *    Examples:
 *      `"feima/deepseek-v4-pro"` → vendor = `"feima"`
 *      `"customendpoint/BytePlus/deepseek-v4-flash"` → vendor = `"customendpoint"`
 *
 * 2. **Heuristic inference** — Fallback for model names without vendor prefix
 *    (e.g. `events.jsonl` model names like `"deepseek-v4-pro"`, `"claude-sonnet-4.6"`).
 *    Matches known model name substrings.
 *
 * 3. **Unknown** — If no match found, returns `"unknown"`.
 *
 * Note: The chat session store source (`chatSessions/*.jsonl`) does NOT use this
 * function — it extracts the vendor directly from `selectedModel.metadata.vendor`,
 * which is the most authoritative source.
 */
export function resolveVendor(model: string): string {
	// 1. Check for vendor prefix in model ID (e.g. "feima/", "copilot/", "customendpoint/")
	const slashIndex = model.indexOf('/');
	if (slashIndex > 0) {
		return model.substring(0, slashIndex);
	}

	// 2. Heuristic fallback for model names without prefix
	const heuristic = heuristicInferVendor(model);
	if (heuristic) {
		return heuristic;
	}

	// 3. Unknown
	return 'unknown';
}

/**
 * Logs the vendor resolution for a set of model names.
 * Useful for debugging vendor attribution issues.
 */
export function logVendorMapping(models: string[], log: ILogService): void {
	log.info('=== Vendor Resolution Map ===');
	for (const model of [...new Set(models)].sort()) {
		const resolved = resolveVendor(model);
		const prefix = model.includes('/') ? model.substring(0, model.indexOf('/')) : '(none)';
		const heuristic = heuristicInferVendor(model) ?? '(none)';
		log.info(`  ${model} → prefix="${prefix}" heuristic="${heuristic}" resolved="${resolved}"`);
	}
	log.info('============================');
}
