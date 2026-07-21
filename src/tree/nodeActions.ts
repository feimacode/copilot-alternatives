/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { findCatalogItem } from './catalogData';
import { TreeNode } from './treeTypes';
import { IDirectoryItem } from '../types/directory';
import { IChatLanguageModelEntry, IChatLanguageModelModel } from '../byok/types';
import { maskApiKey, findChatLanguageModelsFile, readProviders, writeProviders } from '../byok/chatLanguageModels';
import { loadTemplates, getKeyCount, getKeyLabels, IByokTemplate } from '../byok/providerCatalog';
import { openProviderEditor, openModelEditor } from '../byok/byokEditor';

/**
 * Registers all tree node action commands and returns their disposables.
 */
let _nodeActionsExtensionPath = '';
let _nodeActionsRefresh: () => void = () => {};
export function setExtensionPath(p: string): void {
	_nodeActionsExtensionPath = p;
}
export function setTreeRefresher(refresh: () => void): void {
	_nodeActionsRefresh = refresh;
}
export function registerNodeActions(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		// ─── BYOK: open JSON file ───────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.openJsonFile', async () => {
			const fileUri = findChatLanguageModelsFile();
			if (!fileUri) {
				vscode.window.showErrorMessage('Could not locate chatLanguageModels.json');
				return;
			}
			const doc = await vscode.workspace.openTextDocument(fileUri);
			await vscode.window.showTextDocument(doc, { preview: false });
		}),

		// Generic refresh command — can be called from any flow
		vscode.commands.registerCommand('copilotAlternatives.refreshTree', () => {
			_nodeActionsRefresh();
		}),

		// ─── Open README.md ──────────────────────────────────────────────
		vscode.commands.registerCommand('copilotAlternatives.openReadme', async () => {
			if (!_nodeActionsExtensionPath) {
				vscode.window.showErrorMessage('Extension path not available.');
				return;
			}
			const readmePath = path.join(_nodeActionsExtensionPath, 'README.md');
			const readmeUri = vscode.Uri.file(readmePath);
			try {
				const doc = await vscode.workspace.openTextDocument(readmeUri);
				await vscode.window.showTextDocument(doc, { preview: false });
			} catch {
				await vscode.env.openExternal(vscode.Uri.parse('https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/README.md'));
			}
		}),

		// ─── Open help doc ───────────────────────────────────────────────
		vscode.commands.registerCommand('copilotAlternatives.openHelpDoc', async (arg?: string | TreeNode) => {
			if (!_nodeActionsExtensionPath) {
				vscode.window.showErrorMessage('Extension path not available.');
				return;
			}
			// arg can be a filename string (from label click) or a TreeNode (from context menu button)
			let filename: string | undefined;
			if (typeof arg === 'string') {
				filename = arg;
			} else if (arg instanceof TreeNode) {
				filename = arg.id;
			}
			if (!filename) {
				vscode.window.showErrorMessage('No help document specified.');
				return;
			}
			const helpPath = path.join(_nodeActionsExtensionPath, 'help', filename);
			const helpUri = vscode.Uri.file(helpPath);
			try {
				await vscode.commands.executeCommand('markdown.showPreview', helpUri);
			} catch {
				vscode.window.showErrorMessage(`Could not open help document: ${filename}`);
			}
		}),

		// ─── BYOK: add single-key provider from tree ───────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.addProviderInline', async () => {
			await addFilteredProviders({ multiKey: false });
		}),

		// ─── BYOK: add multi-key provider from tree ────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.addMultiKeyProvider', async () => {
			await addFilteredProviders({ multiKey: true });
		}),

		// ─── BYOK: edit provider ────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.editProvider', async (arg?: TreeNode) => {
			const node = arg ?? await tryGetSelectedNode();
			if (!node || node.type !== 'byokProvider') { return; }
			const entry = node.data as IChatLanguageModelEntry;
			await editProvider(entry);
		}),

		// ─── BYOK: add model ────────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.addModel', async (arg?: TreeNode) => {
			const node = arg ?? await tryGetSelectedNode();
			if (!node || node.type !== 'byokProvider') { return; }
			const entry = node.data as IChatLanguageModelEntry;
			const blank: IChatLanguageModelModel = {
				id: '',
				name: '',
				url: '',
				apiType: entry.apiType,
				toolCalling: true,
			};
			const result = await openModelEditor('create', blank, entry);
			if (!result) { return; }
			_nodeActionsRefresh();
			vscode.window.showInformationMessage(`Model "${result.name}" added to "${entry.name}". Reload to apply.`);
		}),

		// ─── BYOK: delete provider ─────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.deleteProvider', async (arg?: TreeNode) => {
			let entry: IChatLanguageModelEntry | undefined;
			if (arg && arg.type === 'byokProvider') {
				entry = arg.data as IChatLanguageModelEntry;
			} else {
				const node = await tryGetSelectedNode();
				if (node?.type === 'byokProvider') {
					entry = node.data as IChatLanguageModelEntry;
				}
			}
			if (!entry) {
				vscode.window.showWarningMessage('No provider selected.');
				return;
			}
			await deleteProvider(entry);
		}),

		// ─── BYOK: delete model ────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.deleteModel', async (arg?: TreeNode | IChatLanguageModelModel) => {
			let model: IChatLanguageModelModel | undefined;
			if (arg && typeof arg === 'object' && 'id' in arg && 'name' in arg && 'url' in arg) {
				model = arg as IChatLanguageModelModel;
			} else if (arg && 'type' in arg && (arg as TreeNode).type === 'byokModel') {
				model = (arg as TreeNode).data as IChatLanguageModelModel;
			} else {
				const node = await tryGetSelectedNode();
				if (node?.type === 'byokModel') {
					model = node.data as IChatLanguageModelModel;
				}
			}
			if (!model) {
				vscode.window.showWarningMessage('No model selected.');
				return;
			}
			await deleteModel(model);
		}),

		// ─── BYOK: edit model ───────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.byok.editModel', async (modelArg?: IChatLanguageModelModel) => {
			if (!modelArg) { return; }
			await editModel(modelArg);
		}),

		// ─── Catalog item actions ────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.openUrl', (urlOrNode: string | TreeNode) => {
			const url = resolveUrl(urlOrNode);
			if (url) {
				vscode.env.openExternal(vscode.Uri.parse(url));
			}
		}),

		vscode.commands.registerCommand('copilotAlternatives.copyLink', async (arg: TreeNode) => {
			const url = resolveUrl(arg);
			if (url) {
				await vscode.env.clipboard.writeText(url);
				vscode.window.showInformationMessage('Link copied to clipboard');
			}
		}),

		vscode.commands.registerCommand('copilotAlternatives.viewDetails', async (arg?: TreeNode) => {
			// Called from context menu — arg is the clicked TreeNode
			// Also called from command palette — need to get the active tree item
			const node = arg ?? await tryGetSelectedNode();
			if (!node) { return; }

			switch (node.type) {
				case 'catalogItem':
					await showCatalogItemDetail(node.data as IDirectoryItem);
					break;
				case 'byokProvider':
					await showByokProviderDetail(node.data as IChatLanguageModelEntry);
					break;
				case 'byokModel':
					await showByokModelDetail(node.data as IChatLanguageModelModel);
					break;
				default:
					vscode.window.showInformationMessage(`Details: ${node.label}`);
			}
		}),

		// ─── BYOK actions ─────────────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.copyToClipboard', async (text: string, message?: string) => {
			await vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage(message ?? 'Copied to clipboard');
		}),

		vscode.commands.registerCommand('copilotAlternatives.copyEndpointUrl', async (arg?: TreeNode) => {
			const node = arg ?? await tryGetSelectedNode();
			if (!node || node.type !== 'byokModel') { return; }
			const model = node.data as IChatLanguageModelModel;
			await vscode.env.clipboard.writeText(model.url);
			vscode.window.showInformationMessage('Endpoint URL copied to clipboard');
		}),

		// ─── Extension actions ───────────────────────────────────────────

		vscode.commands.registerCommand('copilotAlternatives.installExtension', async (extIdOrNode: string | TreeNode) => {
			let extId: string;
			let extName: string;

			if (typeof extIdOrNode === 'string') {
				// Called from tree item command — extId is the string argument
				extId = extIdOrNode;
				extName = extId;
			} else {
				const item = extIdOrNode.data as IDirectoryItem;
				extId = item.extras?.['vscodeExtensionId'] as string;
				extName = item.name;
				if (!extId) {
					vscode.window.showWarningMessage(`"${extName}" is not a VS Code extension — install it from ${item.url || 'its website'}.`);
					return;
				}
			}

			const confirmed = await vscode.window.showInformationMessage(
				`Install "${extName}"?`,
				{ modal: true },
				'Install'
			);
			if (confirmed !== 'Install') {
				return;
			}

			try {
				vscode.window.showInformationMessage(`Installing "${extName}"...`);
				await vscode.commands.executeCommand('workbench.extensions.installExtension', extId);
				vscode.window.showInformationMessage(`"${extName}" installed successfully.`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to install "${extName}": ${message}`);
			}
		}),
	);
}

// ─── Detail view helpers ────────────────────────────────────────────────────

async function showCatalogItemDetail(item: IDirectoryItem): Promise<void> {
	const lines: string[] = [];
	lines.push(`# ${item.name}`);
	lines.push('');

	if (item.description) { lines.push(`${item.description}`); lines.push(''); }
	if (item.price) { lines.push(`**Price**: ${item.price}`); }
	if (item.quota) { lines.push(`**Quota**: ${item.quota}`); }
	if (item.url) { lines.push(`**URL**: ${item.url}`); }
	if (item.models && item.models.length > 0) {
		lines.push('', `**Models**: ${item.models.join(', ')}`);
	}
	if (item.features && item.features.length > 0) {
		lines.push('', `**Features**:`);
		for (const f of item.features) {
			lines.push(`- ${f}`);
		}
	}
	if (item.tags && item.tags.length > 0) {
		lines.push('', `**Tags**: \`${item.tags.join('`, `')}\``);
	}
	if (item.extras) {
		for (const [key, value] of Object.entries(item.extras)) {
			lines.push('', `**${key}**: ${value}`);
		}
	}

	const doc = await vscode.workspace.openTextDocument({
		content: lines.join('\n'),
		language: 'markdown',
	});
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function showByokProviderDetail(entry: IChatLanguageModelEntry): Promise<void> {
	const models = entry.models || [];
	const lines: string[] = [
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

async function showByokModelDetail(model: IChatLanguageModelModel): Promise<void> {
	const caps: string[] = [];
	if (model.toolCalling) { caps.push('🔧 Tools'); }
	if (model.vision) { caps.push('👁 Vision'); }
	if (model.thinking) { caps.push('🧠 Thinking'); }
	if (model.streaming !== false) { caps.push('📡 Streaming'); }

	const contextSize = ((model.maxInputTokens || 0) + (model.maxOutputTokens || 0)).toLocaleString();
	const lines = [
		`# ${model.name}`,
		'',
		`- **ID**: \`${model.id}\``,
		`- **URL**: ${model.url}`,
		`- **Context**: ${contextSize} tokens (${model.maxInputTokens?.toLocaleString() || '?'} in / ${model.maxOutputTokens?.toLocaleString() || '?'} out)`,
		`- **Capabilities**: ${caps.join(', ') || 'none'}`,
	];

	const doc = await vscode.workspace.openTextDocument({
		content: lines.join('\n'),
		language: 'markdown',
	});
	await vscode.window.showTextDocument(doc, { preview: true });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Add a provider with a single API key, filtered to single-key templates only.
 */
async function addFilteredProviders(opts: { multiKey: boolean }): Promise<void> {
	const templates = loadTemplates(path.join(_nodeActionsExtensionPath, 'byok-templates'));
	if (templates.length === 0) {
		vscode.window.showErrorMessage('No BYOK templates found. Check the byok-templates folder.');
		return;
	}

	// Filter templates: single-key (1) vs multi-key (>=2)
	const filtered = templates.filter(t => {
		const kc = getKeyCount(t);
		return opts.multiKey ? kc >= 2 : kc === 1;
	});

	if (filtered.length === 0) {
		vscode.window.showInformationMessage(
			opts.multiKey
				? 'No multi-key BYOK templates found.'
				: 'No single-key BYOK templates found.'
		);
		return;
	}

	// Step 1: Pick a template
	const pickItems: vscode.QuickPickItem[] = filtered.map(t => {
		const modelCount = t.chatLanguageModels.reduce((sum, g) => sum + (g.models?.length ?? 0), 0);
		return {
			label: `$(server) ${t.displayName}`,
			description: `${modelCount} model(s)`,
			detail: t.description,
		};
	});
	const pickTitle = opts.multiKey ? 'Add Multi-Key BYOK Provider' : 'Add Single-Key BYOK Provider';
	const selected = await vscode.window.showQuickPick(pickItems, {
		title: pickTitle,
		placeHolder: 'Choose a provider template',
		canPickMany: false,
	});
	if (!selected) { return; }

	const displayName = selected.label.replace('$(server) ', '');
	const template = filtered.find(t => t.displayName === displayName);
	if (!template) { return; }

	// Step 2 (multi-key only): ask user how many keys to add
	let keyCount = getKeyCount(template);
	if (opts.multiKey) {
		const maxKeys = 10;
		const numberPick = await vscode.window.showQuickPick(
			Array.from({ length: maxKeys }, (_, i) => `${i + 1} key${i === 0 ? '' : 's'}`).map(s => ({
				label: s,
				description: s.startsWith('1') ? '(single key — use plus button instead)' : undefined,
			})),
			{
				title: `How many API keys for "${template.displayName}"?`,
				placeHolder: `Select a number (2–${maxKeys})`,
				canPickMany: false,
			}
		);
		if (!numberPick) { return; }
		const n = parseInt(numberPick.label, 10);
		if (!n || n < 1) { return; }
		keyCount = n;
	}

	// Step 3: Collect API keys
	const keyLabels = getKeyLabels(template);
	const existingNames = (await readProviders()).map(e => e.name);
	const collectedKeys: (string | undefined)[] = [];

	for (let i = 0; i < keyCount; i++) {
		const keyLabel = keyLabels[i] ?? `Key ${i + 1}`;

		const apiKey = await vscode.window.showInputBox({
			title: `API Key — ${keyLabel} (${i + 1}/${keyCount})`,
			prompt: template.keyInstructions,
			password: true,
			placeHolder: `Enter API key for ${keyLabel}`,
			validateInput: (value) => {
				if (!value.trim()) {
					return 'API key cannot be empty (press Esc to cancel)';
				}
				return undefined;
			},
		});

		if (apiKey === undefined) { return; }
		collectedKeys[i] = apiKey.trim();
	}

	// Step 4: Build groups — cycle through template accounts for extra keys
	const totalGroups = template.chatLanguageModels.length;
	const templateKeyCount = getKeyCount(template);
	const groupsPerAccount = Math.max(1, Math.floor(totalGroups / templateKeyCount));
	const groupsToAdd: IChatLanguageModelEntry[] = [];

	for (let i = 0; i < keyCount; i++) {
		// Cycle through template accounts: 0, 1, 2, 0, 1, 2, …
		const accountIdx = i % templateKeyCount;
		const accountNumber = i + 1;
		const start = accountIdx * groupsPerAccount;
		const end = start + groupsPerAccount;
		const bucket = template.chatLanguageModels.slice(start, end);

		for (const groupTemplate of bucket) {
			// Replace the account number in the group name (first \d+ match)
			let groupName = groupTemplate.name.replace(/\d+/, String(accountNumber));
			// If a group with the same name already exists, append " (2)", " (3)", etc.
			if (existingNames.includes(groupName)) {
				let counter = 2;
				let suggestion = `${groupName} (${counter})`;
				while (existingNames.includes(suggestion)) {
					counter++;
					suggestion = `${groupName} (${counter})`;
				}
				vscode.window.showInformationMessage(
					`"${groupName}" already exists — renaming new group to "${suggestion}".`
				);
				groupName = suggestion;
			}
			const group: IChatLanguageModelEntry = {
				...groupTemplate,
				name: groupName,
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

	// Step 5: Register each group via VS Code's lm.addLanguageModelsProviderGroup command.
	// This command internally stores the API key in VS Code's encrypted SecretStorageService
	// and writes a ${input:chat.lm.secret.<hash>} reference to chatLanguageModels.json,
	// which the LanguageModelsService can resolve at runtime.
	// Plaintext writes to the JSON file would be silently ignored because apiKey
	// is marked "secret": true in the customendpoint vendor schema.
	let addedCount = 0;
	try {
		await vscode.commands.executeCommand('github.copilot.activate');
	} catch {
		// Copilot may not be installed — proceed anyway.
	}
	for (const group of groupsToAdd) {
		try {
			await vscode.commands.executeCommand('lm.addLanguageModelsProviderGroup', {
				name: group.name,
				vendor: group.vendor,
				apiKey: group.apiKey,
				apiType: group.apiType,
				models: group.models,
			});
			addedCount++;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to add "${group.name}": ${message}`);
		}
	}

	_nodeActionsRefresh();
	if (addedCount > 0) {
		vscode.window.showInformationMessage(
			`✅ Added ${addedCount} provider group(s) from "${template.displayName}". ` +
			`Models will appear in the chat model picker.`
		);
	}
}

/**
 * Resolves a URL string from either a direct string or a TreeNode.
 */
function resolveUrl(arg: string | TreeNode): string | undefined {
	if (typeof arg === 'string') {
		return arg;
	}
	if (arg.type === 'catalogItem') {
		return (arg.data as IDirectoryItem).url;
	}
	return undefined;
}

/**
 * Attempts to get the currently selected tree node from the active view.
 * Used when a command is invoked from the command palette (no context).
 */
// ─── Edit / Add helpers (webview form editors) ────────────────────────────

async function editProvider(entry: IChatLanguageModelEntry): Promise<void> {
	const allEntries = await readProviders();
	const existingNames = allEntries
		.map(e => e.name)
		.filter(n => n !== entry.name);

	const result = await openProviderEditor('edit', entry, existingNames);
	if (!result) { return; }
	// The editor itself handles persistence + UI feedback.
	// We just refresh the tree.
	_nodeActionsRefresh();
	vscode.window.showInformationMessage(`Provider "${result.name}" saved. Reload VS Code to apply.`);
}

async function editModel(model: IChatLanguageModelModel): Promise<void> {
	const entries = await readProviders();
	let parentEntry: IChatLanguageModelEntry | undefined;

	for (const entry of entries) {
		const models = entry.models || [];
		if (models.find(m => m.id === model.id || m.name === model.name)) {
			parentEntry = entry;
			break;
		}
	}
	if (!parentEntry) {
		vscode.window.showWarningMessage(`Model "${model.name}" not found in any provider.`);
		return;
	}

	const result = await openModelEditor('edit', model, parentEntry);
	if (!result) { return; }
	// The editor itself handles persistence + UI feedback.
	_nodeActionsRefresh();
	vscode.window.showInformationMessage(`Model "${result.name}" saved. Reload VS Code to apply.`);
}

async function deleteProvider(entry: IChatLanguageModelEntry): Promise<void> {
	const modelCount = entry.models?.length ?? 0;
	const message = modelCount > 0
		? `Delete provider "${entry.name}" and all ${modelCount} model(s)?`
		: `Delete provider "${entry.name}"?`;

	const choice = await vscode.window.showWarningMessage(
		message,
		{ modal: true },
		'Delete'
	);
	if (choice !== 'Delete') { return; }

	try {
		const allEntries = await readProviders();
		const filtered = allEntries.filter(e => e.name !== entry.name);
		if (filtered.length === allEntries.length) {
			vscode.window.showWarningMessage(`Provider "${entry.name}" not found.`);
			return;
		}
		await writeProviders(filtered);
		_nodeActionsRefresh();
		vscode.window.showInformationMessage(`✅ Deleted provider "${entry.name}". Reload to apply.`);
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to delete provider: ${m}`);
	}
}

async function deleteModel(model: IChatLanguageModelModel): Promise<void> {
	// Find which provider this model belongs to
	const entries = await readProviders();
	let parentEntry: IChatLanguageModelEntry | undefined;
	let modelIdx = -1;
	for (const entry of entries) {
		const idx = (entry.models || []).findIndex(m => m.id === model.id || m.name === model.name);
		if (idx >= 0) {
			parentEntry = entry;
			modelIdx = idx;
			break;
		}
	}
	if (!parentEntry || modelIdx < 0) {
		vscode.window.showWarningMessage(`Model "${model.name}" not found in any provider.`);
		return;
	}

	const choice = await vscode.window.showWarningMessage(
		`Delete model "${model.name}" from "${parentEntry.name}"?`,
		{ modal: true },
		'Delete'
	);
	if (choice !== 'Delete') { return; }

	try {
		parentEntry.models!.splice(modelIdx, 1);
		await writeProviders(entries);
		_nodeActionsRefresh();
		vscode.window.showInformationMessage(`✅ Deleted model "${model.name}". Reload to apply.`);
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to delete model: ${m}`);
	}
}

/** Strip VS Code-internal range fields before comparison. */
function stripInternal<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const out = { ...obj };
	delete out.range;
	delete out.modelsRange;
	return out;
}

async function tryGetSelectedNode(): Promise<TreeNode | undefined> {
	const viewId = 'copilotAlternatives.main';
	try {
		return undefined;
	} catch {
		return undefined;
	}
}
