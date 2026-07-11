/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerByokCommands } from './byok/byokCommands';
import { TreeProvider } from './tree/treeProvider';
import { registerNodeActions, setExtensionPath, setTreeRefresher } from './tree/nodeActions';
import { findChatLanguageModelsFile } from './byok/chatLanguageModels';

export function activate(context: vscode.ExtensionContext) {
	// ─── Tree View ──────────────────────────────────────────────────────
	const treeProvider = new TreeProvider(context.extensionPath);
	const treeView = vscode.window.createTreeView('copilotAlternatives.main', {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(treeView);

	// Refresh BYOK section when providers change (after add/remove)
	treeView.onDidChangeVisibility(() => {
		if (treeView.visible) {
			treeProvider.refresh();
		}
	});

	// Watch chatLanguageModels.json for external changes
	const jsonFileUri = findChatLanguageModelsFile();
	if (jsonFileUri) {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(jsonFileUri.fsPath, '*'),
			false, // ignoreCreate
			false, // ignoreChange — we want changes
			false  // ignoreDelete
		);
		watcher.onDidChange(() => treeProvider.refresh());
		watcher.onDidCreate(() => treeProvider.refresh());
		watcher.onDidDelete(() => treeProvider.refresh());
		context.subscriptions.push(watcher);
	}

	// ─── Commands ───────────────────────────────────────────────────────
	setExtensionPath(context.extensionPath);
	setTreeRefresher(() => treeProvider.refresh());
	registerNodeActions(context);
	registerByokCommands(context);

	// Command to open/focus the sidebar view
	context.subscriptions.push(
		vscode.commands.registerCommand('copilotAlternatives.openSidebar', () => {
			vscode.commands.executeCommand('workbench.view.extension.copilotAlternatives');
		})
	);

	// Legacy webview directory (kept as fallback)
	context.subscriptions.push(
		vscode.commands.registerCommand('copilotAlternatives.open', () => {
			openDirectory(context);
		})
	);
}

// ─── Legacy webview (kept as fallback) ──────────────────────────────────────

function openDirectory(context: vscode.ExtensionContext) {
	const panel = vscode.window.createWebviewPanel(
		'copilotAlternatives',
		'Copilot Alternatives',
		vscode.ViewColumn.One,
		{ enableScripts: false, retainContextWhenHidden: true }
	);

	const readmePath = path.join(context.extensionPath, 'README.md');
	let readme = '';
	try {
		readme = fs.readFileSync(readmePath, 'utf-8');
	} catch {
		readme = 'README.md not found. Visit https://github.com/feimacode/copilot-alternatives';
	}

	const rows = parseTableSections(readme);

	panel.webview.html = getHtml(rows, readme);
}

interface TableSection {
	title: string;
	tableHtml: string;
}

function parseTableSections(md: string): TableSection[] {
	const sections: TableSection[] = [];
	const parts = md.split(/(?=^### )/gm);

	for (const part of parts) {
		const headingMatch = part.match(/^### (.+)/);
		if (!headingMatch) continue;

		const tableMatch = part.match(/(\|.+\|[\r\n]+\|[-| :]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)/);
		if (!tableMatch) continue;

		const title = headingMatch[1].trim();
		const tableMd = tableMatch[1].trim();
		const tableHtml = markdownTableToHtml(tableMd);
		if (tableHtml) {
			sections.push({ title, tableHtml });
		}
	}
	return sections;
}

function markdownTableToHtml(tableMd: string): string {
	const lines = tableMd.split(/\r?\n/).filter(l => l.trim());
	if (lines.length < 2) return '';

	const headers = parseRow(lines[0]);
	const rows = lines.slice(2).map(parseRow);

	let html = '<table><thead><tr>';
	for (const h of headers) {
		html += '<th>' + renderInlineMd(h) + '</th>';
	}
	html += '</tr></thead><tbody>';
	for (const row of rows) {
		html += '<tr>';
		for (const cell of row) {
			html += '<td>' + renderInlineMd(cell) + '</td>';
		}
		html += '</tr>';
	}
	html += '</tbody></table>';
	return html;
}

function parseRow(line: string): string[] {
	return line.split('|').slice(1, -1).map(c => c.trim());
}

function renderInlineMd(text: string): string {
	let out = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1<\/a>');
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
	return out;
}

function getHtml(sections: TableSection[], rawReadme: string): string {
	const introMatch = rawReadme.match(/^# .+([\s\S]+?)(?=^## )/m);
	const intro = introMatch ? renderInlineMd(introMatch[1].trim().split('\n').filter(l => !l.startsWith('The focus') && !l.startsWith('- AI-powered')).join('\n')) : '';

	const choosingMatch = rawReadme.match(/### Choosing a Coding Plan([\s\S]+?)(?=^---|\n## )/m);
	const choosing = choosingMatch ? renderInlineMd(choosingMatch[1].trim()) : '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Alternatives</title>
<style>
:root {
	--bg: var(--vscode-editor-background, #1e1e2e);
	--fg: var(--vscode-editor-foreground, #e2e8f0);
	--dim: var(--vscode-descriptionForeground, #94a3b8);
	--accent: var(--vscode-textLink-foreground, #7c3aed);
	--accent-bg: var(--vscode-textLink-activeForeground, #a78bfa);
	--border: var(--vscode-widget-border, #334155);
	--card: var(--vscode-editorWidget-background, #282840);
	--card-hover: var(--vscode-list-hoverBackground, #32325a);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
	background: var(--bg);
	color: var(--fg);
	padding: 20px 28px;
	font-size: 13px;
	line-height: 1.5;
}
h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; color: var(--vscode-textLink-foreground); }
.subtitle { color: var(--vscode-descriptionForeground); font-size: 14px; margin-bottom: 24px; }
h2 { font-size: 18px; font-weight: 600; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--vscode-widget-border); }
table { width: 100%; border-collapse: collapse; margin: 8px 0 20px; font-size: 12.5px; }
th { text-align: left; padding: 8px 10px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); font-weight: 600; white-space: nowrap; }
td { padding: 7px 10px; border: 1px solid var(--vscode-widget-border); vertical-align: top; }
tr:hover td { background: var(--vscode-list-hoverBackground); }
a { color: var(--vscode-textLink-foreground); text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: var(--vscode-editorWidget-background); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.toc { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
.toc h2 { margin-top: 0; border: none; padding: 0; }
.toc ul { list-style: none; padding: 0; columns: 2; }
.toc li { padding: 2px 0; }
@media (max-width: 700px) { .toc ul { columns: 1; } }
.note { background: var(--vscode-editorWidget-background); border-left: 3px solid var(--vscode-textLink-foreground); padding: 10px 14px; margin: 10px 0; border-radius: 0 6px 6px 0; font-size: 12.5px; }
</style>
</head>
<body>
<h1>🧩 Copilot Alternatives</h1>
<p class="subtitle">A curated directory of GitHub Copilot alternatives.</p>

<div class="toc"><h2>Contents</h2><ul>
${sections.map(s => `<li><a href="#${slug(s.title)}">${s.title}</a></li>`).join('\n')}
</ul></div>

${sections.map(s => `<h2 id="${slug(s.title)}">${s.title}</h2>${s.tableHtml}`).join('\n')}

${choosing ? '<h2 id="choosing">Choosing a Coding Plan</h2><div class="note">' + choosing.split('\n').filter(l => l.trim()).join('<br>') + '</div>' : ''}
</body>
</html>`;
}

function slug(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function deactivate() {}
