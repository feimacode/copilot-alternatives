/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';

// No vscode mock needed — vendorResolver is pure logic with no VS Code dependencies
import { resolveVendor } from '../tokenUsage/vendorResolver';

describe('vendorResolver', () => {
	// ── Prefix from model ID ──────────────────────────────────────────

	it('extracts vendor from model ID prefix before /', () => {
		expect(resolveVendor('feima/deepseek-v4-pro')).toBe('feima');
		expect(resolveVendor('copilot/claude-sonnet-4.6')).toBe('copilot');
		expect(resolveVendor('customendpoint/BytePlus/deepseek-v4-flash')).toBe('customendpoint');
		expect(resolveVendor('openai/gpt-4o')).toBe('openai');
		expect(resolveVendor('azure/gpt-4o')).toBe('azure');
	});

	// ── Heuristic fallback ───────────────────────────────────────────

	it('falls back to heuristic for model names without prefix', () => {
		expect(resolveVendor('claude-sonnet-4.6')).toBe('anthropic');
		expect(resolveVendor('claude-opus-4')).toBe('anthropic');
		expect(resolveVendor('gpt-4o-mini-2024-07-18')).toBe('openai');
		expect(resolveVendor('gpt-4o')).toBe('openai');
		expect(resolveVendor('gemini-2.5-pro')).toBe('google');
		expect(resolveVendor('gemini-flash')).toBe('google');
		expect(resolveVendor('deepseek-v4-pro')).toBe('deepseek');
		expect(resolveVendor('glm-5.1')).toBe('zhipu');
		expect(resolveVendor('glm-5')).toBe('zhipu');
	});

	it('returns unknown for unrecognized models', () => {
		expect(resolveVendor('some-unknown-model')).toBe('unknown');
		expect(resolveVendor('')).toBe('unknown');
	});

	// ── Prefix takes priority over heuristic ─────────────────────────

	it('prefix takes priority over heuristic when both apply', () => {
		// Even though "claude" heuristically maps to "anthropic",
		// the prefix "feima/" takes priority
		expect(resolveVendor('feima/claude-sonnet-4.6')).toBe('feima');
		expect(resolveVendor('feima/deepseek-v4-pro')).toBe('feima');
	});
});
