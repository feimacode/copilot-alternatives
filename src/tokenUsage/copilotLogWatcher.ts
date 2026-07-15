/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILogService } from '../platform/log/common/logService';

// ─── Log entry ───────────────────────────────────────────────────────────────

export interface CopilotLogEntry {
	timestamp: number;
	requestId: string;
	status: 'success' | 'error' | 'unknown';
	model: string;
	durationMs: number;
	context: string;
}

export interface CopilotLogEvent {
	timestamp: number;
	source: 'chat-log';
	entry: CopilotLogEntry;
	estimatedOutputTokens: number;
	estimatedInputTokens: number;
}

type LogEventHandler = (event: CopilotLogEvent) => void;

// ─── Token rate estimation ──────────────────────────────────────────────────

const MODEL_OUTPUT_RATES: Record<string, number> = {
	'gpt-4o-mini': 120,
	'gpt-4o': 80,
	'claude-opus': 40,
	'claude-sonnet': 80,
	'gemini-flash': 120,
	'gemini-pro': 80,
	'default': 60,
};

function estimateTokensFromDuration(model: string, durationMs: number): { input: number; output: number } {
	const normalized = model.toLowerCase();
	let rate = MODEL_OUTPUT_RATES['default'];
	for (const [key, r] of Object.entries(MODEL_OUTPUT_RATES)) {
		if (normalized.includes(key.toLowerCase())) { rate = r; break; }
	}
	const effectiveDuration = Math.max(durationMs - 200, 100);
	const output = Math.ceil((effectiveDuration * 0.6 / 1000) * rate);
	return { input: output * 10, output };
}

// ─── Parser ─────────────────────────────────────────────────────────────────

const CCREQ_RE = /ccreq:([a-f0-9]+)\.copilotmd\s*\|\s*(success|error)\s*\|\s*([^|]+?)\s*\|\s*(\d+)ms\s*\|\s*\[([^\]]+)\]/;

export function parseCcreqLine(line: string): CopilotLogEntry | null {
	const m = line.match(CCREQ_RE);
	if (!m) { return null; }
	const [, requestId, status, modelStr, durationStr, context] = m;
	const model = modelStr.includes('->') ? modelStr.split('->')[0].trim() : modelStr.trim();
	const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
	return {
		timestamp: tsMatch ? new Date(tsMatch[1]).getTime() : Date.now(),
		requestId,
		status: status as 'success' | 'error',
		model,
		durationMs: parseInt(durationStr, 10),
		context,
	};
}

// ─── Watcher ────────────────────────────────────────────────────────────────

export class CopilotLogWatcher implements vscode.Disposable {
	private readonly _handlers: LogEventHandler[] = [];
	private readonly _pos = new Map<string, number>();
	private readonly _seen = new Set<string>();
	private readonly _watchers: fs.FSWatcher[] = [];
	private readonly _watched = new Set<string>();
	private _pollTimer: ReturnType<typeof setInterval> | undefined;
	private _logsBase: string;
	private _globalState!: vscode.Memento;
	private readonly _log: ILogService;

	constructor(logService: ILogService) {
		this._log = logService;
		this._logsBase = this._resolveLogsBase();
	}

	private _resolveLogsBase(): string {
		const home = os.homedir();
		const candidates = process.platform === 'darwin'
			? [path.join(home, 'Library', 'Application Support', 'Code', 'logs'),
			   path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'logs')]
			: process.platform === 'win32'
			? [path.join(home, 'AppData', 'Roaming', 'Code', 'logs'),
			   path.join(home, 'AppData', 'Roaming', 'Code - Insiders', 'logs')]
			: [path.join(home, '.config', 'Code', 'logs'),
			   path.join(home, '.config', 'Code - Insiders', 'logs'),
			   path.join(home, '.config', 'code-oss-dev', 'logs')];
		// Also probe VS Code Server / Remote (e.g. ~/.vscode-server-insiders/data/logs)
		candidates.push(
			path.join(home, '.vscode-server', 'data', 'logs'),
			path.join(home, '.vscode-server-insiders', 'data', 'logs'));
		for (const p of candidates) {
			if (fs.existsSync(p)) { this._log.debug('Log watcher: using logs dir ' + p); return p; }
		}
		this._log.info('Log watcher: no known logs dir found, defaulting to ' + candidates[0]);
		return candidates[0];
	}

	onLogEvent(handler: LogEventHandler): void { this._handlers.push(handler); }

	activate(context: vscode.ExtensionContext): void {
		this._globalState = context.globalState;
		this._loadState();

		if (!fs.existsSync(this._logsBase)) {
			this._log.info(`Log watcher: directory not found at ${this._logsBase}`);
			return;
		}
		// Defer scan to avoid blocking extension activation.
		// _scan() discovers and reads all Copilot chat log files synchronously.
		setImmediate(() => this._scan());
		this._pollTimer = setInterval(() => this._scan(), 60_000);
		this._log.info(`Log watcher active — ${this._seen.size} known requests, ${this._pos.size} files tracked`);
	}

	private _loadState(): void {
		for (const id of this._globalState.get<string[]>('tw.logIds', [])) { this._seen.add(id); }
		const saved = this._globalState.get<Record<string, number>>('tw.logPositions', {});
		for (const [fp, p] of Object.entries(saved)) { this._pos.set(fp, Math.max(this._pos.get(fp) ?? 0, p)); }
	}

	private _saveState(): void {
		void this._globalState.update('tw.logIds', [...this._seen]);
		const obj: Record<string, number> = {};
		for (const [k, v] of this._pos) { obj[k] = v; }
		void this._globalState.update('tw.logPositions', obj);
	}

	// ── Scan ──────────────────────────────────────────────────────────

	/**
	 * Force-reload all existing log files from scratch.
	 * Clears seen-request tracking and file-position state, then scans
	 * and reads every file from byte 0.
	 */
	reloadAll(): void {
		this._log.info(`Log watcher: force-reloading — clearing ${this._seen.size} seen requests, ${this._pos.size} file positions`);
		this._seen.clear();
		this._pos.clear();
		void this._globalState.update('tw.logIds', undefined);
		void this._globalState.update('tw.logPositions', undefined);
		this._watched.clear();
		this._scan();
		this._saveState();
		this._log.info(`Log watcher: reload complete — ${this._watched.size} files found`);
	}

	private _scan(): void {
		try {
			const now = Date.now();
			const cutoff = now - 24 * 86400000; // only process logs from last 24h
			const dirs = fs.readdirSync(this._logsBase, { withFileTypes: true })
				.filter(d => d.isDirectory())
				.sort((a, b) => b.name.localeCompare(a.name));

			for (const sd of dirs) {
				let wins: fs.Dirent[];
				try {
					wins = fs.readdirSync(path.join(this._logsBase, sd.name), { withFileTypes: true })
						.filter(d => d.isDirectory() && (d.name.startsWith('window') || d.name.startsWith('exthost')));
				} catch { continue; }

				for (const wd of wins) {
					// Desktop builds: window1/exthost/GitHub.copilot-chat/GitHub Copilot Chat.log
					// Server builds:  exthost1/GitHub.copilot-chat/GitHub Copilot Chat.log (no extra exthost/)
					const exthostSubdir = wd.name.startsWith('window')
						? path.join(wd.name, 'exthost')
						: wd.name;
					const fp = path.join(this._logsBase, sd.name, exthostSubdir, 'GitHub.copilot-chat', 'GitHub Copilot Chat.log');
					if (this._watched.has(fp)) { continue; }
					try { if (fs.statSync(fp).mtimeMs < cutoff) { continue; } } catch { continue; }
					this._watched.add(fp);
					this._watch(fp);
				}
			}
		} catch { /* logs may not exist */ }
	}

	private _watch(filePath: string): void {
		this._readNew(filePath);
		try {
			const w = fs.watch(filePath, () => this._readNew(filePath));
			w.on('error', () => {});
			this._watchers.push(w);
		} catch { /* not watchable */ }
	}

	private _readNew(filePath: string): void {
		try {
			const stat = fs.statSync(filePath);
			this._loadState();
			const cur = this._pos.get(filePath) ?? 0;
			if (stat.size <= cur) { return; }

			this._log.trace(`Log watcher: reading ${stat.size - cur} bytes from ${path.basename(filePath)}`);

			const fd = fs.openSync(filePath, 'r');
			const buf = Buffer.alloc(stat.size - cur);
			fs.readSync(fd, buf, 0, buf.length, cur);
			fs.closeSync(fd);
			this._pos.set(filePath, stat.size);

			let matched = 0;
			for (const line of buf.toString('utf8').split('\n')) {
				if (!line.includes('ccreq:')) { continue; }
				const entry = parseCcreqLine(line);
				if (!entry || this._seen.has(entry.requestId)) { continue; }
				this._seen.add(entry.requestId);
				if (this._seen.size > 5_000) {
					const arr = [...this._seen];
					this._seen.clear();
					for (const v of arr.slice(-2_500)) { this._seen.add(v); }
				}
				if (entry.status !== 'success') { continue; }
				matched++;
				const est = estimateTokensFromDuration(entry.model, entry.durationMs);
				for (const h of this._handlers) {
					h({ timestamp: entry.timestamp, source: 'chat-log', entry, estimatedOutputTokens: est.output, estimatedInputTokens: est.input });
				}
			}
			if (matched > 0) {
				this._log.debug(`Log watcher: matched ${matched} ccreq entries from ${path.basename(filePath)}`);
			}
			this._saveState();
		} catch (err) { this._log.warn(`Log watcher: error reading ${filePath}: ${err instanceof Error ? err.message : String(err)}`); }
	}

	dispose(): void {
		this._saveState();
		if (this._pollTimer) { clearInterval(this._pollTimer); }
		for (const w of this._watchers) { w.close(); }
	}
}
