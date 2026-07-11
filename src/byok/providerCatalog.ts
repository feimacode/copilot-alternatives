/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { IChatLanguageModelEntry } from './types';

/**
 * A template loaded from the byok-templates folder.
 *
 * Templates come in pairs:
 * - `<name>.byok.json` — UI metadata (display name, keyUrl, etc.) and a
 *   reference to the chatLanguageModels file. Used by the extension.
 * - `<name>.chatLanguageModels.json` — A pure array in chatLanguageModels.json
 *   format, ready for copy-paste. Used by humans.
 */
export interface IByokTemplate {
	/** Internal template name (e.g., "opencode-go", "deepseek"). */
	readonly name: string;
	/** Display name shown in the quick pick. */
	readonly displayName: string;
	/** Human-readable description. */
	readonly description: string;
	/** URL where the user can obtain an API key. */
	readonly keyUrl: string;
	/** Instructions shown to the user for obtaining the API key. */
	readonly keyInstructions: string;
	/** Number of API keys to collect (1 for single, N for multi). Defaults to 1. */
	readonly keyCount: number;
	/** Labels for each key (e.g., ["Account 1", "Account 2"]). */
	readonly keyLabels: readonly string[];
	/** The provider groups in chatLanguageModels.json format. */
	readonly chatLanguageModels: readonly IChatLanguageModelEntry[];
}

/**
 * The placeholder string in template files for the API key.
 * Users replace this manually when copy-pasting, or our extension
 * replaces it programmatically when importing.
 */
export const KEY_PLACEHOLDER = 'YOUR_API_KEY_HERE';

/**
 * Loads all byok templates from the byok-templates folder.
 * Each `.byok.json` file is paired with a `.chatLanguageModels.json` file.
 */
export function loadTemplates(templatesDir?: string): IByokTemplate[] {
	const dir = templatesDir ?? path.join(__dirname, '..', '..', 'byok-templates');

	let entries: string[];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return [];
	}

	const byokFiles = entries.filter(f => f.endsWith('.byok.json'));
	const templates: IByokTemplate[] = [];

	for (const file of byokFiles) {
		try {
			const metaPath = path.join(dir, file);
			const metaRaw = fs.readFileSync(metaPath, 'utf-8');
			const meta = JSON.parse(metaRaw) as IByokTemplateMeta;

			// Load the corresponding chatLanguageModels array file
			const arrayFile = meta.chatLanguageModelsFile;
			if (!arrayFile) {
				continue;  // Wrapper without an array file is invalid
			}
			const arrayPath = path.join(dir, arrayFile);
			if (!fs.existsSync(arrayPath)) {
				continue;
			}
			const arrayRaw = fs.readFileSync(arrayPath, 'utf-8');
			const array = JSON.parse(arrayRaw) as IChatLanguageModelEntry[];
			if (!Array.isArray(array)) {
				continue;
			}

			templates.push({
				name: meta.name,
				displayName: meta.displayName,
				description: meta.description,
				keyUrl: meta.keyUrl,
				keyInstructions: meta.keyInstructions,
				keyCount: meta.keyCount ?? 1,
				keyLabels: meta.keyLabels ?? [],
				chatLanguageModels: array,
			});
		} catch {
			// Skip malformed templates
		}
	}

	return templates;
}

interface IByokTemplateMeta {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly keyUrl: string;
	readonly keyInstructions: string;
	readonly keyCount?: number;
	readonly keyLabels?: readonly string[];
	readonly chatLanguageModelsFile: string;
}

/**
 * Finds a template by its internal name.
 */
export function findTemplate(name: string, templatesDir?: string): IByokTemplate | undefined {
	return loadTemplates(templatesDir).find(t => t.name === name);
}

/**
 * Returns the key count for a template (1 if not specified).
 */
export function getKeyCount(template: IByokTemplate): number {
	return template.keyCount;
}

/**
 * Returns the key labels for a template (auto-generates if not specified).
 */
export function getKeyLabels(template: IByokTemplate): readonly string[] {
	if (template.keyLabels.length > 0) {
		return template.keyLabels;
	}
	return Array.from({ length: template.keyCount }, (_, i) => `Key ${i + 1}`);
}
