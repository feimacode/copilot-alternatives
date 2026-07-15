/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILogService } from '../platform/log/common/logService';

// ─── JSONL event types ──────────────────────────────────────────────────────

interface SessionMessageEvent {
	type: 'assistant.message';
	data: { messageId: string; content: string; outputTokens: number; interactionId: string };
	id: string;
	timestamp: string;
	parentId: string | null;
}

interface SessionShutdownEvent {
	type: 'session.shutdown';
	data: {
		shutdownType: string;
		totalPremiumRequests: number;
		totalApiDurationMs: number;
		sessionStartTime: number;
		codeChanges: { linesAdded: number; linesRemoved: number; filesModified: string[] };
		modelMetrics: Record<string, {
			requests: { count: number; cost: number };
			usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
		}>;
		currentModel?: string;
	};
	id: string;
	timestamp: string;
	parentId: string | null;
}

type SessionEvent = SessionMessageEvent | SessionShutdownEvent | { type: string; [key: string]: unknown };

// ─── Emitted token event ────────────────────────────────────────────────────

export interface SessionTokenEvent {
	timestamp: number;
	source: 'session-state';
	type: 'message' | 'summary';
	model: string;
	outputTokens: number;
	inputTokens: number;
	cacheReadTokens: number;
	premiumRequests: number;
	sessionId: string;
}

type TokenEventHandler = (event: SessionTokenEvent) => void;

// ─── Pure parsing (exported for testing) ────────────────────────────────────

export function parseSessionLine(line: string): SessionEvent | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) { return null; }
	try { return JSON.parse(trimmed) as SessionEvent; }
	catch { return null; }
}

export function sessionEventToTokenEvents(event: SessionEvent, sessionId: string): SessionTokenEvent[] {
	if (event.type === 'assistant.message') {
		const msg = event as SessionMessageEvent;
		if (msg.data.outputTokens > 0) {
			return [{ timestamp: new Date(msg.timestamp).getTime(), source: 'session-state', type: 'message', model: '', outputTokens: msg.data.outputTokens, inputTokens: 0, cacheReadTokens: 0, premiumRequests: 0, sessionId }];
		}
		return [];
	}
	if (event.type === 'session.shutdown') {
		const sd = event as SessionShutdownEvent;
		// Emit one event per model in modelMetrics — including models with zero usage
		// (they still consumed context and should be tracked for presence detection)
		return Object.entries(sd.data.modelMetrics).map(([model, metrics]) => ({
			timestamp: new Date(sd.timestamp).getTime(),
			source: 'session-state' as const,
			type: 'summary' as const,
			model,
			outputTokens: metrics.usage.outputTokens,
			inputTokens: metrics.usage.inputTokens,
			cacheReadTokens: metrics.usage.cacheReadTokens,
			premiumRequests: metrics.requests.cost,
			sessionId,
		}));
	}
	return [];
}

// ─── Watcher ────────────────────────────────────────────────────────────────

export class CopilotSessionWatcher implements vscode.Disposable {
	private readonly _handlers: TokenEventHandler[] = [];
	private readonly _pos = new Map<string, number>();
	private readonly _seen = new Set<string>();
	private readonly _watchers: fs.FSWatcher[] = [];
	private readonly _knownDirs = new Set<string>();
	private _pollTimer: ReturnType<typeof setInterval> | undefined;
	private _basePath: string;
	private _globalState!: vscode.Memento;
	private readonly _log: ILogService;
	private _reloading = false;

	constructor(logService: ILogService) {
		this._log = logService;
		this._basePath = path.join(os.homedir(), '.copilot', 'session-state');
	}

	onTokenEvent(handler: TokenEventHandler): void { this._handlers.push(handler); }

	activate(context: vscode.ExtensionContext): void {
		this._globalState = context.globalState;
		this._loadState();

		if (!fs.existsSync(this._basePath)) {
			this._log.info(`Session watcher: directory not found at ${this._basePath}`);
			return;
		}
		// Defer scan to avoid blocking extension activation.
		// _scanDirs() calls _watch() which calls _readNew() synchronously
		// on every discovered events.jsonl file.
		setImmediate(() => this._scanDirs());
		this._pollTimer = setInterval(() => this._scanDirs(), 30_000);
		this._log.info(`Session watcher active — ${this._seen.size} known events, ${this._pos.size} files tracked`);
	}

	// ── State ──────────────────────────────────────────────────────────

	private _loadState(): void {
		for (const id of this._globalState.get<string[]>('tw.sessionIds', [])) { this._seen.add(id); }
		const saved = this._globalState.get<Record<string, number>>('tw.sessionPositions', {});
		for (const [fp, p] of Object.entries(saved)) { this._pos.set(fp, Math.max(this._pos.get(fp) ?? 0, p)); }
	}

	private _saveState(): void {
		void this._globalState.update('tw.sessionIds', [...this._seen]);
		const obj: Record<string, number> = {};
		for (const [k, v] of this._pos) { obj[k] = v; }
		void this._globalState.update('tw.sessionPositions', obj);
	}

	// ── Scan / Watch ──────────────────────────────────────────────────

	/**
	 * Force-reload all existing events.jsonl files from scratch.
	 * Clears seen-event tracking and file-position state, then scans
	 * and reads every file from byte 0.
	 */
	reloadAll(): void {
		this._reloading = true;
		this._log.info(`Session watcher: force-reloading — clearing ${this._seen.size} seen events, ${this._pos.size} file positions`);
		this._seen.clear();
		this._pos.clear();
		// Persist cleared state BEFORE reading so _loadState() in _readNew picks up empty data
		void this._globalState.update('tw.sessionIds', []);
		void this._globalState.update('tw.sessionPositions', {});
		for (const dirPath of this._knownDirs) {
			const fp = path.join(dirPath, 'events.jsonl');
			// Reset position to 0 to force full file read.
			// _pos.clear() already handles this, but set explicitly for robustness.
			this._pos.set(fp, 0);
			this._readNew(fp, path.basename(dirPath));
		}
		this._saveState();
		this._reloading = false;
		this._log.info(`Session watcher: reload complete — ${this._knownDirs.size} dirs processed`);
	}

	private _scanDirs(): void {
		const now = Date.now();
		const cutoff = now - 24 * 86400000; // only process sessions active in last 24h
		try {
			for (const e of fs.readdirSync(this._basePath, { withFileTypes: true })) {
				if (!e.isDirectory()) { continue; }
				const dp = path.join(this._basePath, e.name);
				if (this._knownDirs.has(dp)) { continue; }
				const fp = path.join(dp, 'events.jsonl');
				if (!fs.existsSync(fp)) { continue; }
				try { if (fs.statSync(fp).mtimeMs < cutoff) { continue; } } catch { continue; }
				this._knownDirs.add(dp);
				this._log.debug(`Session watcher: discovered new session dir ${e.name}`);
				this._watch(fp, e.name);
			}
		} catch { /* dir may not exist */ }
	}

	private _watch(filePath: string, sessionId: string): void {
		this._readNew(filePath, sessionId);
		try {
			const w = fs.watch(filePath, () => this._readNew(filePath, sessionId));
			w.on('error', () => {});
			this._watchers.push(w);
		} catch { /* not watchable */ }
	}

	private _readNew(filePath: string, sessionId: string): void {
		try {
			const stat = fs.statSync(filePath);
			// Skip _loadState() during reload: in-memory state was cleared
			// and persisted; the async globalState.update() hasn't completed
			// yet, so _loadState() would re-populate _seen with stale IDs.
			if (!this._reloading) {
				this._loadState();
			}
			const cur = this._pos.get(filePath) ?? 0;
			if (stat.size <= cur) { return; }

			this._log.trace(`Session watcher: reading ${stat.size - cur} bytes from ${path.basename(path.dirname(filePath))}`);

			const fd = fs.openSync(filePath, 'r');
			const buf = Buffer.alloc(stat.size - cur);
			fs.readSync(fd, buf, 0, buf.length, cur);
			fs.closeSync(fd);
			this._pos.set(filePath, stat.size);

			let processed = 0;
			for (const line of buf.toString('utf8').split('\n').filter(l => l.trim())) {
				try { if (this._process(JSON.parse(line) as SessionEvent, sessionId)) { processed++; } } catch { /* skip */ }
			}
			if (processed > 0) {
				this._log.debug(`Session watcher: processed ${processed} new events from ${sessionId}`);
			}
			this._saveState();
		} catch (err) { this._log.warn(`Session watcher: error reading ${filePath}: ${err instanceof Error ? err.message : String(err)}`); }
	}

	private _process(event: SessionEvent, sessionId: string): boolean {
		const eid = (event as { id?: string }).id;
		if (eid) {
			if (this._seen.has(eid)) { return false; }
			this._seen.add(eid);
			if (this._seen.size > 10_000) {
				const arr = [...this._seen];
				this._seen.clear();
				for (const v of arr.slice(-5_000)) { this._seen.add(v); }
			}
		}
		const tes = sessionEventToTokenEvents(event, sessionId);
		for (const te of tes) {
			for (const h of this._handlers) { h(te); }
		}
		return tes.length > 0;
	}

	dispose(): void {
		this._saveState();
		if (this._pollTimer) { clearInterval(this._pollTimer); }
		for (const w of this._watchers) { w.close(); }
	}
}
