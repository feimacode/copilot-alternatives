/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { loadTemplates, getKeyCount, getKeyLabels, KEY_PLACEHOLDER } from '../byok/providerCatalog';
import { maskApiKey, hasProviderNamed } from '../byok/chatLanguageModels';
import type { IChatLanguageModelEntry } from '../byok/types';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'byok-templates');

// ---------------------------------------------------------------------------
// Template loading — paired .byok.json + .chatLanguageModels.json files
// ---------------------------------------------------------------------------

describe('loadTemplates', () => {
	it('loads templates from the byok-templates folder', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		expect(templates.length).toBeGreaterThanOrEqual(4);
	});

	it('every template has required metadata', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		for (const t of templates) {
			expect(t.name).toBeTruthy();
			expect(t.displayName).toBeTruthy();
			expect(t.keyUrl).toBeTruthy();
			expect(t.keyInstructions).toBeTruthy();
			expect(Array.isArray(t.chatLanguageModels)).toBe(true);
		}
	});

	it('multi-key templates have keyCount > 1', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		const multiKey = templates.find(t => getKeyCount(t) > 1);
		expect(multiKey).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Copy-paste ready: chatLanguageModels field is a valid chatLanguageModels.json array
// ---------------------------------------------------------------------------

describe('Templates are copy-paste ready (chatLanguageModels.json compatible)', () => {
	it('chatLanguageModels field is a JSON-serializable array', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		for (const t of templates) {
			const json = JSON.stringify(t.chatLanguageModels);
			const parsed = JSON.parse(json);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed.length).toBe(t.chatLanguageModels.length);
		}
	});

	it('each group has all required fields for chatLanguageModels.json', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		for (const t of templates) {
			for (const group of t.chatLanguageModels) {
				expect(group.name).toBeTruthy();
				expect(group.vendor).toBeTruthy();
				expect(group.apiType).toBeTruthy();
				expect(group.apiKey).toBe(KEY_PLACEHOLDER);
				expect(Array.isArray(group.models)).toBe(true);
			}
		}
	});

	it('all groups have unique names within a template', () => {
		const templates = loadTemplates(TEMPLATES_DIR);
		for (const t of templates) {
			const names = t.chatLanguageModels.map(g => g.name);
			expect(new Set(names).size).toBe(names.length);
		}
	});
});

// ---------------------------------------------------------------------------
// The actual .chatLanguageModels.json files on disk are valid chatLanguageModels.json
// ---------------------------------------------------------------------------

describe('chatLanguageModels.json files on disk are valid', () => {
	const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.chatLanguageModels.json'));

	it('at least one .chatLanguageModels.json file exists', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it('every file is a JSON array of provider groups', () => {
		for (const file of files) {
			const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8');
			const parsed = JSON.parse(raw);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed.length).toBeGreaterThan(0);
			for (const group of parsed) {
				expect(group.name).toBeTruthy();
				expect(group.vendor).toBeTruthy();
			}
		}
	});

	it('all files contain the API key placeholder', () => {
		for (const file of files) {
			const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8');
			expect(raw).toContain(KEY_PLACEHOLDER);
		}
	});
});

// ---------------------------------------------------------------------------
// OpenCode Go templates
// ---------------------------------------------------------------------------

describe('OpenCode Go templates', () => {
	it('has a single-key variant with 2 groups (OpenAI + Anthropic)', () => {
		const t = loadTemplates(TEMPLATES_DIR).find(t => t.displayName === 'OpenCode Go (single key)');
		expect(t).toBeDefined();
		if (t) {
			expect(getKeyCount(t)).toBe(1);
			expect(t.chatLanguageModels.length).toBe(2);
			const apiTypes = t.chatLanguageModels.map(g => g.apiType);
			expect(apiTypes).toContain('chat-completions');
			expect(apiTypes).toContain('messages');
		}
	});

	it('has a multi-key variant with 6 groups (2 per account)', () => {
		const t = loadTemplates(TEMPLATES_DIR).find(t => t.displayName === 'OpenCode Go (multi-key)');
		expect(t).toBeDefined();
		if (t) {
			expect(getKeyCount(t)).toBe(3);
			expect(t.chatLanguageModels.length).toBe(6);
			expect(getKeyLabels(t)).toEqual(['Account 1', 'Account 2', 'Account 3']);
		}
	});

	it('multi-key variant has 2 groups per account', () => {
		const t = loadTemplates(TEMPLATES_DIR).find(t => t.displayName === 'OpenCode Go (multi-key)');
		expect(t).toBeDefined();
		if (t) {
			for (const acc of [1, 2, 3]) {
				const accountGroups = t.chatLanguageModels.filter(g => g.name.includes(`OpenCode Go ${acc}`));
				expect(accountGroups.length).toBe(2);
				const apiTypes = accountGroups.map(g => g.apiType);
				expect(apiTypes).toContain('chat-completions');
				expect(apiTypes).toContain('messages');
			}
		}
	});

	it('all OpenCode Go models use valid endpoints', () => {
		const templates = loadTemplates(TEMPLATES_DIR).filter(t => t.name === 'opencode-go');
		for (const t of templates) {
			for (const group of t.chatLanguageModels) {
				for (const model of group.models ?? []) {
					expect(model.url).toMatch(/^https:\/\/opencode\.ai\/zen\/go\/v1\//);
				}
			}
		}
	});
});

// ---------------------------------------------------------------------------
// maskApiKey
// ---------------------------------------------------------------------------

describe('maskApiKey', () => {
	it('returns "(not set)" for undefined', () => {
		expect(maskApiKey(undefined)).toBe('(not set)');
	});

	it('returns "(encrypted)" for VS Code secret references', () => {
		expect(maskApiKey('${input:chat.lm.secret.xxx}')).toBe('(encrypted)');
	});

	it('masks short keys fully', () => {
		expect(maskApiKey('short')).toBe('●●●●●●●●');
	});

	it('shows first and last 4 chars of long keys', () => {
		const masked = maskApiKey('sk-abc123456789xyz');
		expect(masked).toBe('sk-a●●●●9xyz');
	});

	it('shows the YOUR_API_KEY_HERE placeholder clearly', () => {
		expect(maskApiKey('YOUR_API_KEY_HERE')).toBe('YOUR_API_KEY_HERE (replace with real key)');
	});
});

// ---------------------------------------------------------------------------
// hasProviderNamed
// ---------------------------------------------------------------------------

describe('hasProviderNamed', () => {
	const entries: IChatLanguageModelEntry[] = [
		{ name: 'OpenCode Go 1 - OpenAI', vendor: 'customendpoint' },
		{ name: 'OpenCode Go 1 - Anthropic', vendor: 'customendpoint' },
		{ name: 'DeepSeek', vendor: 'customendpoint' },
	];

	it('returns true when name matches', () => {
		expect(hasProviderNamed(entries, 'OpenCode Go 1 - OpenAI')).toBe(true);
		expect(hasProviderNamed(entries, 'DeepSeek')).toBe(true);
	});

	it('returns false when name does not match', () => {
		expect(hasProviderNamed(entries, 'OpenCode Go 2 - OpenAI')).toBe(false);
		expect(hasProviderNamed(entries, '')).toBe(false);
	});

	it('returns false for empty array', () => {
		expect(hasProviderNamed([], 'OpenCode Go')).toBe(false);
	});
});
