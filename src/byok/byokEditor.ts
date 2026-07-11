/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IChatLanguageModelEntry, IChatLanguageModelModel } from './types';
import { readProviders, writeProviders } from './chatLanguageModels';

// ─── Singleton panel tracking ──────────────────────────────────────────────

let _activeProviderPanel: vscode.WebviewPanel | undefined;
let _activeModelPanel: vscode.WebviewPanel | undefined;

function getProviderTitle(mode: 'create' | 'edit', name: string): string {
	return mode === 'create' ? 'Add Provider' : `Edit Provider — ${name}`;
}

function getModelTitle(mode: 'create' | 'edit', name: string, parentName: string): string {
	return mode === 'create' ? `Add Model to ${parentName}` : `Edit Model — ${name}`;
}

/**
 * Opens a custom webview form editor for a provider.
 * The editor handles persistence itself and stays open across saves.
 * Singleton: if a provider panel is already open, it is revealed and reused.
 * Resolves to the saved entry on the FIRST save, or undefined if the user
 * closes the panel without saving.
 */
export function openProviderEditor(
	mode: 'create' | 'edit',
	original: IChatLanguageModelEntry,
	providerNames: readonly string[]
): Promise<IChatLanguageModelEntry | undefined> {
	return new Promise(resolve => {
		// If a panel is already open, reveal it and re-render for this entry
		if (_activeProviderPanel) {
			_activeProviderPanel.reveal();
			_activeProviderPanel.title = getProviderTitle(mode, original.name);
			_activeProviderPanel.webview.html = getProviderEditorHtml(original, mode, providerNames);
			// Note: the original panel's promise won't fire — we resolve this new
			// promise immediately on the existing panel's next save via a side channel.
			// For simplicity, we close the existing one and open a new one.
		}
		if (_activeProviderPanel) {
			_activeProviderPanel.dispose();
		}

		const panel = vscode.window.createWebviewPanel(
			'copilotAlternatives.byokProviderEditor',
			getProviderTitle(mode, original.name),
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);
		_activeProviderPanel = panel;

		panel.webview.html = getProviderEditorHtml(original, mode, providerNames);
		let resolved = false;
		let currentMode: 'create' | 'edit' = mode;
		let currentOriginal: IChatLanguageModelEntry = { ...original };

		const disposable = panel.webview.onDidReceiveMessage(async msg => {
			if (msg.type === 'requestApiKey') {
				const newKey = await vscode.window.showInputBox({
					title: 'Update API Key',
					prompt: `Enter the new API key for "${currentOriginal.name}"`,
					password: true,
					placeHolder: 'API key (stored encrypted)',
					validateInput: (value) => {
						if (!value.trim()) { return 'Key cannot be empty'; }
						return undefined;
					},
				});
				panel.webview.postMessage({
					type: 'apiKeyValue',
					value: newKey ?? '',
				});
				return;
			}

			if (msg.type === 'cancel') {
				disposable.dispose();
				panel.dispose();
				return;
			}

			if (msg.type !== 'save') { return; }

			// Build the new entry
			const newEntry: IChatLanguageModelEntry = {
				...currentOriginal,
				name: msg.entry.name,
				vendor: msg.entry.vendor || 'customendpoint',
				apiType: msg.entry.apiType,
			} as IChatLanguageModelEntry;
			if (msg.entry.apiKey === '__keep__') {
				newEntry.apiKey = currentOriginal.apiKey;
			} else if (msg.entry.apiKey === '__clear__') {
				delete (newEntry as Record<string, unknown>).apiKey;
			} else if (typeof msg.entry.apiKey === 'string') {
				newEntry.apiKey = msg.entry.apiKey;
			}

			try {
				const allEntries = await readProviders();
				const idx = allEntries.findIndex(e => e.name === currentOriginal.name);
				if (idx >= 0) {
					allEntries[idx] = newEntry;
				} else {
					allEntries.push(newEntry);
				}
				await writeProviders(allEntries);
				panel.webview.postMessage({ type: 'saveSuccess' });

				// Update the in-memory original so subsequent saves diff against the new state
				currentOriginal = { ...newEntry };

				// After a successful "create" save, switch the panel to "edit" mode
				if (currentMode === 'create') {
					currentMode = 'edit';
					panel.title = getProviderTitle('edit', newEntry.name);
					// Update the readonly apiKey display to show the now-saved value
					panel.webview.postMessage({ type: 'modeChanged', mode: 'edit', entry: newEntry });
				}

				if (!resolved) {
					resolved = true;
					resolve(newEntry);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				panel.webview.postMessage({ type: 'saveError', message });
			}
		});

		panel.onDidDispose(() => {
			disposable.dispose();
			_activeProviderPanel = undefined;
			if (!resolved) { resolve(undefined); }
		});
	});
}

/**
 * Opens a custom webview form editor for a model.
 * Singleton: if a model panel is already open, it is disposed and replaced.
 * After a successful "create" save, the panel transitions to "edit" mode.
 */
export function openModelEditor(
	mode: 'create' | 'edit',
	original: IChatLanguageModelModel,
	parentProvider: IChatLanguageModelEntry
): Promise<IChatLanguageModelModel | undefined> {
	return new Promise(resolve => {
		// Singleton: close any existing model panel
		if (_activeModelPanel) {
			_activeModelPanel.dispose();
		}

		const panel = vscode.window.createWebviewPanel(
			'copilotAlternatives.byokModelEditor',
			getModelTitle(mode, original.name, parentProvider.name),
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);
		_activeModelPanel = panel;

		panel.webview.html = getModelEditorHtml(original, mode, parentProvider);
		let resolved = false;
		let currentMode: 'create' | 'edit' = mode;
		let currentOriginal: IChatLanguageModelModel = { ...original };
		let currentParent: IChatLanguageModelEntry = parentProvider;

		const disposable = panel.webview.onDidReceiveMessage(async msg => {
			if (msg.type === 'cancel') {
				disposable.dispose();
				panel.dispose();
				return;
			}

			if (msg.type !== 'save') { return; }

			const m = msg.model as Record<string, unknown>;
			const result: IChatLanguageModelModel = {
				...currentOriginal,
			};
			if (typeof m.name === 'string') { result.name = m.name; }
			if (typeof m.id === 'string') { result.id = m.id; }
			if (typeof m.url === 'string' && m.url.trim()) {
				result.url = m.url;
			}
			if (m.apiType) { result.apiType = m.apiType as string; }
			else { delete (result as Record<string, unknown>).apiType; }
			if (typeof m.toolCalling === 'boolean') { result.toolCalling = m.toolCalling; }
			if (typeof m.vision === 'boolean') { result.vision = m.vision; }
			if (typeof m.thinking === 'boolean') { result.thinking = m.thinking; }
			if (typeof m.streaming === 'boolean') { result.streaming = m.streaming; }
			if (m.maxInputTokens !== '' && m.maxInputTokens !== null && m.maxInputTokens !== undefined) {
				result.maxInputTokens = Number(m.maxInputTokens);
			} else {
				delete (result as Record<string, unknown>).maxInputTokens;
			}
			if (m.maxOutputTokens !== '' && m.maxOutputTokens !== null && m.maxOutputTokens !== undefined) {
				result.maxOutputTokens = Number(m.maxOutputTokens);
			} else {
				delete (result as Record<string, unknown>).maxOutputTokens;
			}

			try {
				const allEntries = await readProviders();
				let parentEntry: IChatLanguageModelEntry | undefined;
				let modelIdx = -1;

				for (const entry of allEntries) {
					if (entry.name === currentParent.name) {
						parentEntry = entry;
						const models = entry.models || [];
						if (currentMode === 'edit') {
							modelIdx = models.findIndex(mm => mm.id === currentOriginal.id || mm.name === currentOriginal.name);
						}
						break;
					}
				}

				if (!parentEntry) {
					panel.webview.postMessage({ type: 'saveError', message: `Provider "${currentParent.name}" not found.` });
					return;
				}

				if (currentMode === 'create') {
					parentEntry.models = [...(parentEntry.models || []), result];
				} else if (modelIdx >= 0) {
					parentEntry.models![modelIdx] = result;
				} else {
					parentEntry.models = [...(parentEntry.models || []), result];
				}

				await writeProviders(allEntries);
				panel.webview.postMessage({ type: 'saveSuccess' });

				// After a successful "create" save, switch to "edit" mode
				if (currentMode === 'create') {
					currentMode = 'edit';
					currentOriginal = { ...result };
					panel.title = getModelTitle('edit', result.name, currentParent.name);
					panel.webview.postMessage({ type: 'modeChanged', mode: 'edit', model: result });
				} else {
					currentOriginal = { ...result };
				}

				if (!resolved) {
					resolved = true;
					resolve(result);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				panel.webview.postMessage({ type: 'saveError', message });
			}
		});

		panel.onDidDispose(() => {
			disposable.dispose();
			_activeModelPanel = undefined;
			if (!resolved) { resolve(undefined); }
		});
	});
}

function numOrUndef(v: unknown): number | undefined {
	if (v === '' || v === null || v === undefined) { return undefined; }
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Masks a key for display in the readonly field.
 * - Encrypted secret references: show as "(encrypted)"
 * - Placeholder: show as-is
 * - Plain text: mask the middle
 * - Empty: show empty
 */
function maskKeyForDisplay(key: string | undefined): string {
	if (!key) { return ''; }
	if (key.startsWith('${input:')) { return '•••••••• (encrypted)'; }
	if (key === 'YOUR_API_KEY_HERE') { return 'YOUR_API_KEY_HERE (placeholder)'; }
	if (key.length <= 8) { return '••••••••'; }
	return key.substring(0, 4) + '••••' + key.substring(key.length - 4);
}

/**
 * Inline mask for newly-entered keys (no original to compare against).
 */
function maskKeyInline(value: string): string {
	if (!value) { return ''; }
	if (value.length <= 8) { return '••••••••'; }
	return value.substring(0, 4) + '••••' + value.substring(value.length - 4);
}

// ─── HTML / CSS ─────────────────────────────────────────────────────────────

function editorStyles(): string {
	return `
	:root {
		--bg: var(--vscode-editor-background, #1e1e2e);
		--fg: var(--vscode-editor-foreground, #e2e8f0);
		--dim: var(--vscode-descriptionForeground, #94a3b8);
		--accent: var(--vscode-textLink-foreground, #7c3aed);
		--accent-fg: var(--vscode-button-background, #7c3aed);
		--border: var(--vscode-widget-border, #334155);
		--input-bg: var(--vscode-input-background, #21212c);
		--input-fg: var(--vscode-input-foreground, #e2e8f0);
		--input-border: var(--vscode-input-border, #334155);
		--focus: var(--vscode-focusBorder, #7c3aed);
		--error: var(--vscode-errorForeground, #f87171);
		--success: var(--vscode-terminal-ansiGreen, #22c55e);
	}
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		font-family: var(--vscode-font-family, system-ui);
		background: var(--bg);
		color: var(--fg);
		padding: 24px 32px;
		font-size: 13px;
		line-height: 1.5;
	}
	.title { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
	.subtitle { color: var(--dim); font-size: 12px; margin-bottom: 24px; }
	form { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
	.row { display: flex; flex-direction: column; gap: 4px; }
	.row.inline { flex-direction: row; gap: 12px; align-items: center; }
	.row.inline > label { flex: 0 0 auto; min-width: 130px; }
	label { font-size: 12px; font-weight: 500; color: var(--dim); }
	.hint { font-size: 11px; color: var(--dim); }
	input[type="text"], input[type="url"], input[type="password"], input[type="number"], select, textarea {
		background: var(--input-bg);
		color: var(--input-fg);
		border: 1px solid var(--input-border);
		border-radius: 4px;
		padding: 6px 10px;
		font-family: inherit;
		font-size: 13px;
		outline: none;
		width: 100%;
	}
	input:focus, select:focus, textarea:focus { border-color: var(--focus); }
	.checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }
	.checkbox input { width: auto; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
	button {
		background: var(--accent-fg);
		color: white;
		border: none;
		border-radius: 4px;
		padding: 8px 18px;
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	button:hover { filter: brightness(1.1); }
	button.secondary {
		background: transparent;
		color: var(--fg);
		border: 1px solid var(--border);
	}
	button.danger { background: var(--error); }
	.error { color: var(--error); font-size: 12px; min-height: 16px; }
	.success { color: var(--success); font-size: 12px; }
	.section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
	.section-title { font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }
	.pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: var(--input-bg); border: 1px solid var(--border); color: var(--dim); }
	.field-with-button { display: flex; gap: 8px; align-items: stretch; }
	.field-with-button input { flex: 1; }
	.field-with-button button {
		white-space: nowrap;
		padding: 6px 14px;
		font-size: 12px;
		background: transparent;
		color: var(--accent);
		border: 1px solid var(--accent);
	}
	.field-with-button button:hover { background: var(--accent); color: white; }
	.api-key-display { font-family: monospace; letter-spacing: 0.5px; }
	`;
}

function getProviderEditorHtml(
	entry: IChatLanguageModelEntry,
	mode: 'create' | 'edit',
	existingNames: readonly string[]
): string {
	const esc = (v: string) => v.replace(/"/g, '&quot;').replace(/</g, '&lt;');
	const existingJson = JSON.stringify(existingNames);
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${editorStyles()}</style>
</head>
<body>
<div class="title">${mode === 'create' ? 'Add Provider' : 'Edit Provider'}</div>
<div class="subtitle">${mode === 'create'
		? 'Configure a new BYOK provider group.'
		: 'Edit the fields you want to change. Empty fields are left as-is.'}</div>

<form id="form">
	<div class="row">
		<label for="name">Group Name <span class="pill">required</span></label>
		<input id="name" type="text" value="${esc(entry.name ?? '')}" placeholder="e.g., Feima Code" required>
		<div class="hint">Display name shown in the model picker.</div>
	</div>

	<div class="row">
		<label for="vendor">Vendor</label>
		<input id="vendor" type="text" value="${esc(entry.vendor ?? 'customendpoint')}" placeholder="customendpoint">
		<div class="hint">Use <code>customendpoint</code> for most third-party providers.</div>
	</div>

	<div class="row">
		<label for="apiType">API Type</label>
		<select id="apiType">
			${['chat-completions', 'messages', 'responses']
				.map(t => `<option value="${t}"${(entry.apiType ?? 'chat-completions') === t ? ' selected' : ''}>${t}</option>`)
				.join('')}
		</select>
		<div class="hint">The protocol spoken by the endpoint.</div>
	</div>

	<div class="row">
		<label for="apiKey">API Key</label>
		<div class="field-with-button">
			<input id="apiKey" type="text" class="api-key-display" value="${esc(maskKeyForDisplay(entry.apiKey))}" placeholder="${mode === 'edit' ? '(no key set — click Update to set one)' : 'YOUR_API_KEY_HERE or \${input:chat.lm.secret.xxx}'}" readonly>
			<button type="button" id="updateKeyBtn">${mode === 'edit' ? 'Update' : 'Set Key'}</button>
		</div>
		<div class="hint">Stored encrypted in the OS keystore. Click the button to change it.</div>
	</div>

	<div class="error" id="err"></div>

	<div class="actions">
		<button type="button" class="secondary" id="cancelBtn">Cancel</button>
		<button type="submit" id="saveBtn">${mode === 'create' ? 'Add Provider' : 'Save Changes'}</button>
	</div>
</form>

<script>
const vscode = acquireVsCodeApi();
const existingNames = ${existingJson};

const form = document.getElementById('form');
const errEl = document.getElementById('err');
const apiKeyInput = document.getElementById('apiKey');
let newApiKey = null; // holds the new value before save

document.getElementById('cancelBtn').addEventListener('click', () => {
	vscode.postMessage({ type: 'cancel' });
});

document.getElementById('updateKeyBtn').addEventListener('click', () => {
	vscode.postMessage({ type: 'requestApiKey' });
});

window.addEventListener('message', e => {
	const msg = e.data;
	if (msg.type === 'apiKeyValue') {
		newApiKey = msg.value;
		apiKeyInput.value = maskKeyInline(msg.value);
		apiKeyInput.title = msg.value ? 'Click Update to set a different value' : '';
	}
	if (msg.type === 'saveSuccess') {
		errEl.className = 'success';
		errEl.textContent = '✓ Saved successfully';
		setTimeout(() => { errEl.textContent = ''; errEl.className = 'error'; }, 3000);
	}
	if (msg.type === 'saveError') {
		errEl.className = 'error';
		errEl.textContent = 'Save failed: ' + msg.message;
	}
});

form.addEventListener('submit', e => {
	e.preventDefault();
	errEl.textContent = '';
	const entry = {
		name: document.getElementById('name').value.trim(),
		vendor: document.getElementById('vendor').value.trim() || 'customendpoint',
		apiType: document.getElementById('apiType').value,
		// Send the new key only if one was entered; otherwise keep the original
		apiKey: newApiKey !== null ? newApiKey : (${mode === 'edit'} ? '__keep__' : ''),
	};
	if (!entry.name) {
		errEl.textContent = 'Group name is required.';
		return;
	}
	// In create mode, if the name conflicts, suggest a " (2)" / " (3)" suffix
	if (${mode === 'create'} && existingNames.includes(entry.name)) {
		const originalName = entry.name;
		let counter = 2;
		let suggestion = originalName + ' (' + counter + ')';
		while (existingNames.includes(suggestion)) {
			counter++;
			suggestion = originalName + ' (' + counter + ')';
		}
		entry.name = suggestion;
		errEl.className = 'success';
		errEl.textContent = '"' + originalName + '" already exists — using "' + suggestion + '" instead.';
		setTimeout(() => { errEl.textContent = ''; errEl.className = 'error'; }, 4000);
	}
	vscode.postMessage({ type: 'save', entry });
});
</script>
</body>
</html>`;
}

function getModelEditorHtml(
	model: IChatLanguageModelModel,
	mode: 'create' | 'edit',
	parent: IChatLanguageModelEntry
): string {
	const esc = (v: string | undefined) => (v ?? '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;');
	const num = (v: number | undefined) => v ?? '';
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${editorStyles()}</style>
</head>
<body>
<div class="title">${mode === 'create' ? 'Add Model' : 'Edit Model'}</div>
<div class="subtitle">${mode === 'create'
		? `Adding to provider <code>${esc(parent.name)}</code>.`
		: 'Edit the fields you want to change.'}</div>

<form id="form">
	<div class="row inline">
		<label for="name">Display Name</label>
		<input id="name" type="text" value="${esc(model.name)}" placeholder="e.g., GPT-4o" required>
	</div>

	<div class="row inline">
		<label for="id">Model ID <span class="pill">required</span></label>
		<input id="id" type="text" value="${esc(model.id)}" placeholder="e.g., gpt-4o" required>
		<div class="hint">Identifier sent to the API.</div>
	</div>

	<div class="row inline">
		<label for="url">Endpoint URL</label>
		<input id="url" type="url" value="${esc(model.url ?? '')}" placeholder="https://api.example.com/v1/chat/completions" required>
	</div>

	<div class="row inline">
		<label for="apiType">API Type</label>
		<select id="apiType">
			${['chat-completions', 'messages', 'responses', '']
				.map(t => `<option value="${t}"${(model.apiType ?? parent.apiType ?? 'chat-completions') === t ? ' selected' : ''}>${t || '(inherit from provider)'}</option>`)
				.join('')}
		</select>
	</div>

	<div class="section">
		<div class="section-title">Capabilities</div>
		<div class="row inline" style="gap: 20px; flex-wrap: wrap;">
			<label class="checkbox"><input type="checkbox" id="toolCalling"${model.toolCalling ? ' checked' : ''}> Tool Calling</label>
			<label class="checkbox"><input type="checkbox" id="vision"${model.vision ? ' checked' : ''}> Vision</label>
			<label class="checkbox"><input type="checkbox" id="thinking"${model.thinking ? ' checked' : ''}> Thinking</label>
			<label class="checkbox"><input type="checkbox" id="streaming"${model.streaming !== false ? ' checked' : ''}> Streaming</label>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Context Limits</div>
		<div class="row inline">
			<label for="maxInputTokens">Max Input Tokens</label>
			<input id="maxInputTokens" type="number" value="${num(model.maxInputTokens)}" placeholder="e.g., 128000 (leave blank to inherit)" min="0">
		</div>
		<div class="row inline">
			<label for="maxOutputTokens">Max Output Tokens</label>
			<input id="maxOutputTokens" type="number" value="${num(model.maxOutputTokens)}" placeholder="e.g., 16384" min="0">
		</div>
	</div>

	<div class="error" id="err"></div>

	<div class="actions">
		<button type="button" class="secondary" id="cancelBtn">Cancel</button>
		<button type="submit" id="saveBtn">${mode === 'create' ? 'Add Model' : 'Save Changes'}</button>
	</div>
</form>

<script>
const vscode = acquireVsCodeApi();
const form = document.getElementById('form');
const errEl = document.getElementById('err');
document.getElementById('cancelBtn').addEventListener('click', () => {
	vscode.postMessage({ type: 'cancel' });
});

form.addEventListener('submit', e => {
	e.preventDefault();
	errEl.textContent = '';
	const model = {
		name: document.getElementById('name').value.trim(),
		id: document.getElementById('id').value.trim(),
		url: document.getElementById('url').value.trim(),
		apiType: document.getElementById('apiType').value,
		toolCalling: document.getElementById('toolCalling').checked,
		vision: document.getElementById('vision').checked,
		thinking: document.getElementById('thinking').checked,
		streaming: document.getElementById('streaming').checked,
		maxInputTokens: document.getElementById('maxInputTokens').value,
		maxOutputTokens: document.getElementById('maxOutputTokens').value,
	};
	if (!model.id) { errEl.textContent = 'Model ID is required.'; return; }
	if (!model.url) { errEl.textContent = 'Endpoint URL is required.'; return; }
	vscode.postMessage({ type: 'save', model });
});

// Listen for save-result messages from the host
window.addEventListener('message', e => {
	const msg = e.data;
	if (msg.type === 'saveSuccess') {
		errEl.className = 'success';
		errEl.textContent = '✓ Saved successfully';
		setTimeout(() => { errEl.textContent = ''; errEl.className = 'error'; }, 3000);
	}
	if (msg.type === 'saveError') {
		errEl.className = 'error';
		errEl.textContent = 'Save failed: ' + msg.message;
	}
	if (msg.type === 'modeChanged' && msg.mode === 'edit' && msg.model) {
		const m = msg.model;
		if (m.url) {
			document.getElementById('url').value = m.url;
		}
	}
});
</script>
</body>
</html>`;
}
