/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authentication } from 'vscode';
import { skuToPlan, resolveEntitlement } from '../tokenUsage/copilotEntitlement';

function fakeLog() {
	return { debug() {}, info() {}, warn() {}, trace() {}, createSubLogger() { return fakeLog(); } } as any;
}

function fakeContext() {
	const store = new Map<string, unknown>();
	return {
		globalState: {
			get: (key: string) => store.get(key),
			update: async (key: string, value: unknown) => { store.set(key, value); },
		},
	} as any;
}

describe('skuToPlan', () => {
	it('maps known SKU substrings to plans', () => {
		expect(skuToPlan('copilot_pro_seat')).toBe('pro');
		expect(skuToPlan('copilot_business')).toBe('business');
		expect(skuToPlan('copilot_enterprise_seat')).toBe('enterprise');
		expect(skuToPlan('copilot_free')).toBe('free');
	});

	it('returns null for unrecognized SKUs', () => {
		expect(skuToPlan('something_else')).toBeNull();
	});
});

describe('resolveEntitlement', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		authentication.getSession = (async () => undefined) as any;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('returns undefined gracefully when no GitHub session is available', async () => {
		const result = await resolveEntitlement(fakeContext(), fakeLog(), { interactive: false });
		expect(result).toBeUndefined();
	});

	it('returns undefined gracefully when the token endpoint fails', async () => {
		authentication.getSession = async () => ({ accessToken: 'tok', account: { id: '1', label: 'u' }, id: 's', scopes: [] }) as any;
		global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as any;
		const result = await resolveEntitlement(fakeContext(), fakeLog(), { interactive: false });
		expect(result).toBeUndefined();
	});

	it('resolves and caches an entitlement on success', async () => {
		authentication.getSession = async () => ({ accessToken: 'tok', account: { id: '1', label: 'u' }, id: 's', scopes: [] }) as any;
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ sku: 'copilot_pro_seat' }),
		}) as any;

		const context = fakeContext();
		const result = await resolveEntitlement(context, fakeLog(), { interactive: false });
		expect(result?.planName).toBe('pro');
		expect(result?.monthlyCreditsIncluded).toBe(1500);

		// Cached: a second call should not need a session/fetch to succeed again
		authentication.getSession = (async () => undefined) as any;
		const cached = await resolveEntitlement(context, fakeLog(), { interactive: false });
		expect(cached?.planName).toBe('pro');
	});
});
