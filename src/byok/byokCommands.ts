/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { loadTemplates, IByokTemplate, getKeyCount, getKeyLabels } from './providerCatalog';
import { readProviders, maskApiKey, removeProviderByName } from './chatLanguageModels';
import { IChatLanguageModelEntry } from './types';

/**
 * Registers all BYOK management commands.
 */
let _extensionPath = '';

export function registerByokCommands(context: vscode.ExtensionContext): void {
	_extensionPath = context.extensionPath;
	context.subscriptions.push(
		vscode.commands.registerCommand('copilotAlternatives.byok.add', () => addProvider()),
		vscode.commands.registerCommand('copilotAlternatives.byok.list', () => listProviders()),
		vscode.commands.registerCommand('copilotAlternatives.byok.remove', () => removeProvider()),
		vscode.commands.registerCommand('copilotAlternatives.byok.openTemplatesFolder', () => openTemplatesFolder()),
	);
}

// ─── Templates folder ────────────────────────────────────────────────────────

function getTemplatesDir(): string {
	return path.join(_extensionPath, 'byok-templates');
}

async function openTemplatesFolder(): Promise<void> {
	const dir = getTemplatesDir();
	const uri = vscode.Uri.file(dir);
	try {
		await vscode.commands.executeCommand('vscode.openFolder', uri);
	} catch {
		await vscode.commands.executeCommand('revealFileInOS', uri);
	}
}

// ─── Add Provider ────────────────────────────────────────────────────────────

async function addProvider(): Promise<void> {
	const templates = loadTemplates(getTemplatesDir());
	if (templates.length === 0) {
		vscode.window.showErrorMessage('No BYOK templates found. Check the byok-templates folder.');
		return;
	}

	// Step 1: Pick a template
	const template = await pickTemplate(templates);
	if (!template) {
		return;
	}

	// Step 2: Group provider groups by key/account.
	// Some templates (e.g. OpenCode Go) have multiple groups per key
	// because models use different API formats (chat-completions vs messages).
	const keyBuckets = groupByKey(template);
	const keyLabels = getKeyLabels(template);

	// Step 3: Collect API keys (one per bucket)
	const existingNames = (await readProviders()).map(e => e.name);
	const collectedKeys: (string | undefined)[] = [];

	for (let i = 0; i < keyBuckets.length; i++) {
		const bucket = keyBuckets[i];
		const keyLabel = keyLabels[i] ?? `Key ${i + 1}`;

		// Skip buckets where ALL groups already exist
		const allExist = bucket.groups.every(g => existingNames.includes(g.name));
		if (allExist) {
			vscode.window.showInformationMessage(
				`⏭ Skipped "${bucket.groups.map(g => g.name).join(', ')}" — already configured.`
			);
			continue;
		}

		// Prompt for the API key
		const apiKey = await vscode.window.showInputBox({
			title: `API Key — ${keyLabel}`,
			prompt: template.keyInstructions,
			password: true,
			placeHolder: `Enter API key for ${keyLabel}`,
			validateInput: (value) => {
				if (!value.trim()) {
					return 'API key cannot be empty (press Esc to skip this account)';
				}
				return undefined;
			},
		});

		if (apiKey === undefined) {
			const continueAdd = await vscode.window.showWarningMessage(
				`Skip ${keyLabel}?`,
				{ modal: true },
				'Skip',
				'Cancel All'
			);
			if (continueAdd === 'Cancel All') {
				return;
			}
			continue;
		}

		collectedKeys[i] = apiKey.trim();
	}

	// Build final groups
	const groupsToAdd: IChatLanguageModelEntry[] = [];
	for (let i = 0; i < keyBuckets.length; i++) {
		if (!collectedKeys[i]) {
			continue;
		}
		const bucket = keyBuckets[i];
		for (const groupTemplate of bucket.groups) {
			if (existingNames.includes(groupTemplate.name)) {
				continue;
			}
			const group: IChatLanguageModelEntry = {
				...groupTemplate,
				apiKey: collectedKeys[i],
			};
			delete (group as Record<string, unknown>).range;
			delete (group as Record<string, unknown>).modelsRange;
			groupsToAdd.push(group);
		}
	}

	if (groupsToAdd.length === 0) {
		vscode.window.showInformationMessage('No providers added.');
		return;
	}

	// Step 4: Add each group via VS Code's command (encrypts keys)
	let successCount = 0;
	let failCount = 0;
	for (const group of groupsToAdd) {
		try {
			await vscode.commands.executeCommand('lm.addLanguageModelsProviderGroup', group);
			successCount++;
		} catch (err) {
			failCount++;
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to add "${group.name}": ${message}`);
		}
	}

	if (successCount > 0) {
		vscode.window.showInformationMessage(
			`✅ Added ${successCount} provider group(s) from "${template.displayName}". ` +
			`Models will appear in the chat model picker.`
		);
	}
}

// ─── List Providers ──────────────────────────────────────────────────────────

async function listProviders(): Promise<void> {
	const entries = await readProviders();

	if (entries.length === 0) {
		vscode.window.showInformationMessage(
			'No BYOK providers configured. Use "BYOK: Add Provider" to get started.'
		);
		return;
	}

	const items: vscode.QuickPickItem[] = entries.map(entry => ({
		label: `$(key) ${entry.name}`,
		description: entry.vendor,
		detail: buildProviderDetail(entry),
	}));

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Configured BYOK Providers',
		placeHolder: 'Select a provider to view details',
		canPickMany: false,
	});

	if (selected) {
		const entry = entries.find(e => e.name === selected.label.replace('$(key) ', ''));
		if (entry) {
			await showProviderDetail(entry);
		}
	}
}

function buildProviderDetail(entry: IChatLanguageModelEntry): string {
	const models = entry.models || [];
	const modelCount = models.length;
	const firstModels = models.slice(0, 3).map(m => m.name).join(', ');
	const more = modelCount > 3 ? `, +${modelCount - 3} more` : '';
	const keyStatus = maskApiKey(entry.apiKey);
	return `${modelCount} model(s): ${firstModels}${more} | Key: ${keyStatus}`;
}

async function showProviderDetail(entry: IChatLanguageModelEntry): Promise<void> {
	const models = entry.models || [];
	const lines = [
		`# ${entry.name}`,
		'',
		`**Vendor**: ${entry.vendor}`,
		`**API Type**: ${entry.apiType || 'chat-completions'}`,
		`**API Key**: ${maskApiKey(entry.apiKey)}`,
		'',
		`## Models (${models.length})`,
		'',
	];

	for (const model of models) {
		const caps: string[] = [];
		if (model.toolCalling) { caps.push('🔧 Tools'); }
		if (model.vision) { caps.push('👁 Vision'); }
		if (model.thinking) { caps.push('🧠 Thinking'); }
		if (model.streaming !== false) { caps.push('📡 Streaming'); }

		const contextSize = ((model.maxInputTokens || 0) + (model.maxOutputTokens || 0)).toLocaleString();
		lines.push(`### ${model.name}`);
		lines.push(`- **ID**: \`${model.id}\``);
		lines.push(`- **URL**: ${model.url}`);
		lines.push(`- **Context**: ${contextSize} tokens (${model.maxInputTokens?.toLocaleString() || '?'} in / ${model.maxOutputTokens?.toLocaleString() || '?'} out)`);
		lines.push(`- **Capabilities**: ${caps.join(', ') || 'none'}`);
		lines.push('');
	}

	const doc = await vscode.workspace.openTextDocument({
		content: lines.join('\n'),
		language: 'markdown',
	});
	await vscode.window.showTextDocument(doc, { preview: true });
}

// ─── Remove Provider ─────────────────────────────────────────────────────────

async function removeProvider(): Promise<void> {
	const entries = await readProviders();

	if (entries.length === 0) {
		vscode.window.showInformationMessage('No BYOK providers configured.');
		return;
	}

	const items: vscode.QuickPickItem[] = entries.map(entry => ({
		label: `$(trash) ${entry.name}`,
		description: entry.vendor,
		detail: buildProviderDetail(entry),
	}));

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Remove BYOK Provider',
		placeHolder: 'Select a provider to remove',
		canPickMany: true,
	});

	if (!selected || selected.length === 0) {
		return;
	}

	const confirmed = await vscode.window.showWarningMessage(
		`Remove ${selected.length} provider group(s)? Reload VS Code to apply.`,
		{ modal: true },
		'Remove'
	);

	if (confirmed !== 'Remove') {
		return;
	}

	for (const item of selected) {
		const name = item.label.replace('$(trash) ', '');
		const removed = await removeProviderByName(name);
		if (removed) {
			vscode.window.showInformationMessage(`✅ Removed "${name}".`);
		}
	}
	await vscode.commands.executeCommand('copilotAlternatives.refreshTree');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pickTemplate(templates: IByokTemplate[]): Promise<IByokTemplate | undefined> {
	const items: vscode.QuickPickItem[] = templates.map(t => ({
		label: `$(server) ${t.displayName}`,
		description: getKeyCount(t) > 1 ? `${getKeyCount(t)} keys` : '1 key',
		detail: t.description,
	}));

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Add BYOK Provider — Select Template',
		placeHolder: 'Choose a provider template',
		canPickMany: false,
	});

	if (!selected) {
		return undefined;
	}

	const displayName = selected.label.replace('$(server) ', '');
	return templates.find(t => t.displayName === displayName);
}

interface KeyBucket {
	groups: readonly IChatLanguageModelEntry[];
}

/**
 * Groups provider groups by their key position.
 * For multi-key templates, divides groups evenly across keys.
 * (Templates with 2 groups per key — e.g. OpenAI + Anthropic for the same
 *  account — are configured to have the right group count per key.)
 */
function groupByKey(template: IByokTemplate): KeyBucket[] {
	const totalGroups = template.chatLanguageModels.length;
	const keyCount = getKeyCount(template);
	const groupsPerKey = Math.max(1, Math.floor(totalGroups / keyCount));
	const buckets: KeyBucket[] = [];

	for (let i = 0; i < keyCount; i++) {
		const start = i * groupsPerKey;
		const end = i === keyCount - 1 ? totalGroups : start + groupsPerKey;
		const groups = template.chatLanguageModels.slice(start, end);
		if (groups.length > 0) {
			buckets.push({ groups });
		}
	}

	return buckets;
}
