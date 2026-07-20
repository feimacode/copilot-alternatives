/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { estimateCopilotCredits, formatCredits } from '../tokenUsage/copilotCreditEstimator';

describe('estimateCopilotCredits', () => {
	it('computes credits for a known model using input/output rates', () => {
		const credits = estimateCopilotCredits('claude-sonnet-4', 1_000_000, 1_000_000);
		// claudesonnet4: input=300/M, output=1500/M
		expect(credits).toBeCloseTo(300 + 1500, 5);
	});

	it('handles vendor-prefixed model ids', () => {
		const credits = estimateCopilotCredits('anthropic/claude-sonnet-4', 1_000_000, 0);
		expect(credits).toBeCloseTo(300, 5);
	});

	it('subtracts cached tokens from net input before applying input rate', () => {
		const withoutCache = estimateCopilotCredits('gpt-4o', 1_000_000, 0, 0);
		const withCache = estimateCopilotCredits('gpt-4o', 1_000_000, 0, 500_000);
		expect(withCache).toBeLessThan(withoutCache);
	});

	it('falls back to the default rate for unknown models', () => {
		const credits = estimateCopilotCredits('some-unrecognized-model-xyz', 1_000_000, 1_000_000);
		expect(credits).toBeCloseTo(300 + 1500, 5);
	});

	it('never returns a negative value', () => {
		const credits = estimateCopilotCredits('gpt-4o', 100, 0, 10_000);
		expect(credits).toBeGreaterThanOrEqual(0);
	});
});

describe('formatCredits', () => {
	it('formats small numbers as whole/decimal', () => {
		expect(formatCredits(128)).toBe('128');
		expect(formatCredits(5)).toBe('5.0');
	});

	it('formats thousands with K suffix', () => {
		expect(formatCredits(1500)).toBe('1.5K');
	});

	it('formats millions with M suffix', () => {
		expect(formatCredits(2_500_000)).toBe('2.50M');
	});
});
