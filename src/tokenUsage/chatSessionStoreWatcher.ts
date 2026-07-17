/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILogService } from '../platform/log/common/logService';
import type { MetricsService } from './metricsService';

// ─── Settings ──────────────────────────────────────────────────────────────

/**
 * How far back (in days) the real-time file watcher looks for .jsonl files.
 * Separate from the background backfill window to keep live scanning cheap.
 * Default: 1 day (24 hours).
 */
const SETTING_WATCHER_WINDOW_DAYS = 'copilotAlternatives.tokenUsage.watcherWindowDays';
const DEFAULT_WATCHER_WINDOW_DAYS = 1;

// ─── Emitted event ──────────────────────────────────────────────────────────

/**
 * Per-request token event parsed from VS Code's chat session store
 * (workspaceStorage/{workspaceId}/chatSessions/{sessionId}.jsonl). Contains actual API token
 * counts and full model metadata -- no heuristic inference needed.
 */
export interface ChatSessionStoreEvent {
	timestamp: number;
	source: 'chat-session-store';
	sessionId: string;
	requestId: string;
	/** Full model identifier, e.g. "feima/deepseek-v4-pro" or "customendpoint/BytePlus/deepseek-v4-flash" */
	model: string;
	/** Exact vendor from model metadata, e.g. "feima", "openai", "anthropic" */
	vendor: string;
	/** Whether this model is a BYOK (bring-your-own-key) model */
	isBYOK: boolean;
	/** Human-readable model name from metadata, e.g. "[Feima] DeepSeek V4 Pro" */
	modelName: string;
	/** Model family from metadata, e.g. "deepseek-v4" */
	modelFamily: string;
	/** Extension that registered this model, e.g. "feima.copilot-more-llms" */
	extensionId: string;
	/** Actual prompt tokens reported by the API */
	promptTokens: number;
	/** Actual completion tokens reported by the API */
	completionTokens: number;
	/** End-to-end latency in milliseconds */
	elapsedMs: number;
}

type EventHandler = (event: ChatSessionStoreEvent) => void;

// ─── WSL detection ────────────────────────────────────────────────────────

let _isWsl: boolean | undefined;

/**
 * Detects whether the extension is running inside WSL (Windows Subsystem for Linux).
 * Cached after first call.
 */
function isWSL(): boolean {
	if (_isWsl !== undefined) { return _isWsl; }
	try {
		const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
		_isWsl = version.includes('microsoft') || version.includes('wsl');
	} catch {
		_isWsl = false;
	}
	return _isWsl;
}

/**
 * When running in WSL, the VS Code client runs on Windows and stores chat
 * sessions at Windows paths. These are accessible from WSL via `/mnt/c/`.
 * Returns the Windows user directories found under `/mnt/c/Users/`.
 */
function getWindowsUserDirs(): string[] {
	const dirs: string[] = [];
	if (!isWSL()) { return dirs; }
	try {
		const usersPath = '/mnt/c/Users';
		if (!fs.existsSync(usersPath)) { return dirs; }
		const entries = fs.readdirSync(usersPath, { withFileTypes: true });
		const systemDirs = new Set(['public', 'default', 'default user', 'all users', 'default account']);
		for (const entry of entries) {
			if (!entry.isDirectory()) { continue; }
			const name = entry.name.toLowerCase();
			if (systemDirs.has(name)) { continue; }
			dirs.push(entry.name);
		}
	} catch {
		// /mnt/c may not be available
	}
	return dirs;
}

// ─── Workspace storage path probing ─────────────────────────────────────────

/**
 * Returns candidate workspaceStorage root directories across all supported
 * VS Code variants (Stable, Insiders, OSS dev) and environments (desktop, server, WSL).
 */
function getWorkspaceStorageRoots(home: string): string[] {
	const roots: string[] = [];

	if (process.platform === 'win32') {
		roots.push(
			path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
			path.join(home, 'AppData', 'Roaming', 'Code - Insiders', 'User', 'workspaceStorage'),
		);
	} else if (process.platform === 'darwin') {
		roots.push(
			path.join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
			path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage'),
		);
	} else {
		// Linux desktop
		roots.push(
			path.join(home, '.config', 'Code', 'User', 'workspaceStorage'),
			path.join(home, '.config', 'Code - Insiders', 'User', 'workspaceStorage'),
			path.join(home, '.config', 'code-oss-dev', 'User', 'workspaceStorage'),
		);

		// WSL: VS Code client runs on Windows, chat sessions stored at Windows paths
		if (isWSL()) {
			const winUsers = getWindowsUserDirs();
			for (const user of winUsers) {
				const base = path.join('/mnt/c/Users', user, 'AppData', 'Roaming');
				roots.push(
					path.join(base, 'Code', 'User', 'workspaceStorage'),
					path.join(base, 'Code - Insiders', 'User', 'workspaceStorage'),
				);
			}
		}
	}

	// VS Code Server / Remote (Linux)
	roots.push(
		path.join(home, '.vscode-server', 'data', 'User', 'workspaceStorage'),
		path.join(home, '.vscode-server-insiders', 'data', 'User', 'workspaceStorage'),
	);

	// OSS dev
	roots.push(
		path.join(home, '.vscode-oss-dev', 'User', 'workspaceStorage'),
	);

	return roots;
}

// ─── ObjectMutationLog parser ───────────────────────────────────────────────

/**
 * Reconstructs a chat session state from VS Code's ObjectMutationLog format.
 *
 * Entry kinds:
 *   0 (Initial) = full state snapshot
 *   1 (Set)     = property update at path `k` with new value `v`
 *   2 (Push)    = push items `v` onto array at path `k`; optional `i` truncates first
 *   3 (Delete)  = delete property at path `k`
 */
interface MutationEntry {
	kind: 0 | 1 | 2 | 3;
	v?: unknown;
	k?: (string | number)[];
	i?: number;
}

function setAtPath(state: Record<string, unknown>, path: (string | number)[], value: unknown): void {
	let current = state;
	for (let i = 0; i < path.length - 1; i++) {
		const seg = path[i];
		current = current[seg] as Record<string, unknown>;
		if (!current) { return; }
	}
	current[path[path.length - 1]] = value;
}

function pushToArray(state: Record<string, unknown>, path: (string | number)[], values: unknown[] | undefined, startIndex?: number): void {
	let current = state;
	for (let i = 0; i < path.length - 1; i++) {
		const seg = path[i];
		current = current[seg] as Record<string, unknown>;
		if (!current) { return; }
	}
	const arrayKey = path[path.length - 1];
	const arr = (current[arrayKey] as unknown[]) ?? [];
	if (startIndex !== undefined) {
		arr.length = startIndex;
	}
	if (values && values.length > 0) {
		arr.push(...values);
	}
	current[arrayKey] = arr;
}

function reconstructState(entries: MutationEntry[]): Record<string, unknown> | null {
	let state: Record<string, unknown> | null = null;
	for (const entry of entries) {
		switch (entry.kind) {
			case 0:
				state = entry.v as Record<string, unknown>;
				break;
			case 1:
				if (state && entry.k) { setAtPath(state, entry.k, entry.v); }
				break;
			case 2:
				if (state && entry.k) { pushToArray(state, entry.k, entry.v as unknown[], entry.i); }
				break;
			case 3:
				if (state && entry.k) { setAtPath(state, entry.k, undefined); }
				break;
		}
	}
	return state;
}

function parseMutationLog(content: string): MutationEntry[] {
	const entries: MutationEntry[] = [];
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) { continue; }
		try {
			entries.push(JSON.parse(trimmed) as MutationEntry);
		} catch {
			// skip malformed lines
		}
	}
	return entries;
}

// ─── Vendor resolution ────────────────────────────────────────────────────

/**
 * Resolves the actual vendor from a model ID when the vendor prefix is
 * `customendpoint`. The model ID format for custom endpoint models is:
 *
 *   customendpoint/<providerName>/<modelName>
 *
 * The second segment is the actual provider (e.g. "BytePlus", "Feima Code").
 *
 * Falls back to `detail` from metadata, then to `"customendpoint"` itself.
 */
function resolveCustomEndpointVendor(modelId: string, detail?: string): string {
	const parts = modelId.split('/');
	if (parts.length >= 3) {
		const provider = parts[1].trim();
		if (provider.length > 0) { return provider; }
	}
	return detail ?? 'customendpoint';
}

/**
 * Extracts a VS Code ExtensionIdentifier's `.value` field, handling both
 * the raw ExtensionIdentifier shape ({ value, _lower }) and plain strings.
 */
function extractExtensionId(raw: unknown): string | undefined {
	if (!raw) { return undefined; }
	if (typeof raw === 'string') { return raw; }
	const obj = raw as Record<string, unknown>;
	if (typeof obj.value === 'string') { return obj.value; }
	return undefined;
}

// ─── Watcher ────────────────────────────────────────────────────────────────

/**
 * Watches workspaceStorage/{workspaceId}/chatSessions/{sessionId}.jsonl files (VS Code's chat session
 * store format — an append-only ObjectMutationLog). Reconstructs session state
 * from mutation entries and emits per-request token events with full model metadata.
 */
export class ChatSessionStoreWatcher implements vscode.Disposable {
	private readonly _handlers: EventHandler[] = [];
	private readonly _seenRequestIds = new Set<string>();
	private readonly _knownChatDirs = new Set<string>();
	private _globalState!: vscode.Memento;
	private readonly _log: ILogService;
	/** Debounce timers per file path — coalesces duplicate watcher events from Windows NTFS. */
	private readonly _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	private _metricsService: MetricsService | undefined;

	constructor(logService: ILogService) {
		this._log = logService;
	}

	/** Wire to MetricsService so file changes trigger DB imports. */
	setMetricsService(ms: MetricsService): void {
		this._metricsService = ms;
	}

	onEvent(handler: EventHandler): void {
		this._handlers.push(handler);
	}

	activate(context: vscode.ExtensionContext): void {
		this._globalState = context.globalState;
		this._loadState();

		// Defer initial scan to avoid blocking extension activation
		setImmediate(() => this._scanWorkspaceRoots());

		// Register VS Code file system watchers for live updates
		this._registerVSCodeWatchers(context);

		// WSL-only: inotify cannot cross the drvfs /mnt/c boundary, so VS Code's
		// file system watcher never fires for Windows-side chat session files.
		// Fall back to polling those roots every 10 s.
		if (isWSL()) {
			const wslRoots = getWorkspaceStorageRoots(os.homedir())
				.filter(r => r.startsWith('/mnt/') && fs.existsSync(r));
			if (wslRoots.length > 0) {
				const pollTimer = setInterval(() => {
					for (const root of wslRoots) {
						void this._pollWSLRoot(root);
					}
				}, 120_000);
				context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
				this._log.debug(`ChatSessionStore: WSL polling active for ${wslRoots.length} Windows root(s)`);
			}
		}

		this._log.info(
			`ChatSessionStore watcher active — ${this._seenRequestIds.size} known requests, ` +
			`${this._knownChatDirs.size} chatSessions dirs` +
			(isWSL() ? ' [WSL mode: probing Windows paths]' : '')
		);
	}

	// ── VS Code FSWatcher registration ─────────────────────────────

	/**
	 * Registers two vscode.workspace.createFileSystemWatcher watchers per
	 * existing storage root:
	 *
	 *   Watcher A — pattern `*` (direct children of storage root), onDidCreate only.
	 *     Fires when a new workspace dir is created. Triggers _scanChatDir for it.
	 *     No time filter — we want to know about any new workspace dir.
	 *
	 *   Watcher B — pattern `*\/chatSessions\/*.jsonl`, onCreate + onChange.
	 *     Fires when a JSONL file is created or modified. Calls _processFile.
	 *     The 24h window is enforced by the watcher window setting at process time.
	 *
	 * Watcher lifecycle is tied to context.subscriptions — no manual cleanup needed.
	 * WSL /mnt/c paths are included in roots but VS Code Server inotify does not
	 * cross the drvfs boundary; the initial scan covers those paths instead.
	 */
	private _registerVSCodeWatchers(context: vscode.ExtensionContext): void {
		const roots = getWorkspaceStorageRoots(os.homedir()).filter(r => fs.existsSync(r));
		for (const root of roots) {
			const rootUri = vscode.Uri.file(root);

			// Watcher A: new workspace dirs (no time filter)
			const watcherA = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(rootUri, '*'),
				false, // ignoreCreateEvents
				true,  // ignoreChangeEvents
				true   // ignoreDeleteEvents
			);
			watcherA.onDidCreate(uri => {
				const chatDir = path.join(uri.fsPath, 'chatSessions');
				if (this._knownChatDirs.has(chatDir)) { return; }
				if (!fs.existsSync(chatDir)) { return; }
				this._knownChatDirs.add(chatDir);
				this._log.debug(`ChatSessionStore: discovered new chatSessions dir at ${chatDir}`);
				this._scanChatDir(chatDir);
			});
			context.subscriptions.push(watcherA);

			// Watcher B: JSONL file create/change (24h filter at processing time)
			const watcherB = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(rootUri, '*/chatSessions/*.jsonl'),
				false, // ignoreCreateEvents
				false, // ignoreChangeEvents
				true   // ignoreDeleteEvents
			);
			watcherB.onDidCreate(uri => this._processFile(uri.fsPath));
			watcherB.onDidChange(uri => this._processFile(uri.fsPath));
			context.subscriptions.push(watcherB);

			this._log.debug(`ChatSessionStore: registered watchers for ${root}`);
		}
	}

	// ── State persistence ──────────────────────────────────────────

	private _loadState(): void {
		for (const id of this._globalState.get<string[]>('csw.seenRequestIds', [])) {
			this._seenRequestIds.add(id);
		}
	}

	private _saveState(): void {
		void this._globalState.update('csw.seenRequestIds', [...this._seenRequestIds]);
	}

	// ── Scanning ───────────────────────────────────────────────────

	private _scanWorkspaceRoots(): void {
		const roots = getWorkspaceStorageRoots(os.homedir());
		for (const root of roots) {
			try {
				if (!fs.existsSync(root)) { continue; }
				const entries = fs.readdirSync(root, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.isDirectory()) { continue; }
					const chatDir = path.join(root, entry.name, 'chatSessions');
					if (!fs.existsSync(chatDir)) { continue; }
					if (this._knownChatDirs.has(chatDir)) { continue; }
					this._knownChatDirs.add(chatDir);
					this._log.debug(`ChatSessionStore: discovered chatSessions dir at ${chatDir}`);
					this._scanChatDir(chatDir);

				}
			} catch {
				// skip inaccessible roots
			}
		}
	}

	private _scanChatDir(dir: string): void {
		const config = vscode.workspace.getConfiguration();
		const watcherDays = config.get<number>(SETTING_WATCHER_WINDOW_DAYS, DEFAULT_WATCHER_WINDOW_DAYS);
		const cutoffMs = Date.now() - (watcherDays * 86400000);

		try {
			const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
			for (const file of files) {
				const fp = path.join(dir, file);
				// Skip files older than the configured backfill window
				try {
					const stat = fs.statSync(fp);
					if (stat.mtimeMs < cutoffMs) { continue; }
				} catch { /* skip files we can't stat */ }
				this._processFile(fp);
			}
		} catch {
			// skip inaccessible dirs
		}
	}

	/**
	 * WSL polling: fully async so drvfs latency doesn't block the extension host event loop.
	 *
	 * Each tick:
	 *   1. readdir(root) — discover new workspace dirs.
	 *   2. For each known chatDir under root: readdir to list .jsonl files.
	 *   3. Per file: stat for the time-window cutoff only, then hand off to _processFile.
	 *      Change detection (mtime + size + hash) is delegated to importSingleFile which
	 *      queries the processed_files DB table — persistent across restarts and shared
	 *      across VS Code instances.
	 */
	private async _pollWSLRoot(root: string): Promise<void> {
		// 1. Discover new workspace dirs not yet tracked
		try {
			const entries = await fs.promises.readdir(root, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) { continue; }
				const chatDir = path.join(root, entry.name, 'chatSessions');
				if (this._knownChatDirs.has(chatDir)) { continue; }
				try {
					await fs.promises.access(chatDir);
					this._knownChatDirs.add(chatDir);
					this._log.debug(`ChatSessionStore: WSL poll discovered ${chatDir}`);
				} catch { /* chatSessions dir doesn't exist */ }
			}
		} catch { /* root inaccessible */ }

		// 2. Scan known chatDirs for new or modified .jsonl files
		const config = vscode.workspace.getConfiguration();
		const watcherDays = config.get<number>(SETTING_WATCHER_WINDOW_DAYS, DEFAULT_WATCHER_WINDOW_DAYS);
		const cutoffMs = Date.now() - (watcherDays * 86400000);

		for (const chatDir of this._knownChatDirs) {
			if (!chatDir.startsWith(root)) { continue; }
			try {
				const files = await fs.promises.readdir(chatDir);
				for (const file of files) {
					if (!file.endsWith('.jsonl')) { continue; }
					const fp = path.join(chatDir, file);
					try {
						const stat = await fs.promises.stat(fp);
						if (stat.mtimeMs < cutoffMs) { continue; } // outside backfill window, skip
						// importSingleFile checks processed_files (mtime+size+hash) and skips if unchanged
						this._processFile(fp);
					} catch { /* file disappeared */ }
				}
			} catch { /* dir inaccessible */ }
		}
	}

	// ── File processing ────────────────────────────────────────────

	/**
	 * Delegate DB import to metricsService, then emit events for the live tracker.
	 * Skips event emission when the file hasn't changed (importSingleFile returns false),
	 * avoiding a wasteful second file read+parse.
	 */
	private _processFile(filePath: string): void {
		// Debounce per-file: Windows NTFS watcher fires onDidCreate + onDidChange (or two onDidChange)
		// for a single write, typically ~75ms apart. Coalesce into one import after 200ms.
		const existing = this._debounceTimers.get(filePath);
		if (existing !== undefined) { clearTimeout(existing); }
		this._debounceTimers.set(filePath, setTimeout(() => {
			this._debounceTimers.delete(filePath);
			this._doProcessFile(filePath);
		}, 200));
	}

	private _doProcessFile(filePath: string): void {
		// Let metricsService handle the DB import (incremental via processed_files table).
		// Returns true only if the file was new/changed and actually imported.
		const importPromise = this._metricsService
			? this._metricsService.importSingleFile(filePath).catch(() => false)
			: Promise.resolve(false);

		importPromise.then(imported => {
			// Only emit live events if the file had new data worth looking at
			if (imported) {
				this._emitEventsFromFile(filePath);
			}
		}).catch(() => { /* ignore */ });
	}

	private _emitEventsFromFile(filePath: string): void {
		try {
			if (!fs.existsSync(filePath)) { return; }
			const stat = fs.statSync(filePath);
			if (stat.size === 0) { return; }

			const content = fs.readFileSync(filePath, 'utf8');
			const entries = parseMutationLog(content);
			if (entries.length === 0) { return; }

			const state = reconstructState(entries);
			if (!state || !state.sessionId || !state.requests) { return; }

			// Extract model metadata from session-level input state (fallback for per-request vendor)
			const inputState = state.inputState as Record<string, unknown> | undefined;
			const selectedModel = inputState?.selectedModel as Record<string, unknown> | undefined;
			const metaData = selectedModel?.metadata as Record<string, unknown> | undefined;

			const sessionVendor = (metaData?.vendor as string) ?? undefined;
			const sessionIsBYOK = !!(metaData?.isBYOK);
			const sessionModelName = (metaData?.name as string) ?? undefined;
			const sessionModelFamily = (metaData?.family as string) ?? undefined;
			const sessionDetail = (metaData?.detail as string) ?? undefined;
			const sessionExtensionId = extractExtensionId(metaData?.extension);

			const requests = state.requests as Record<string, unknown>[];
			const sessionCreation = state.creationDate as number ?? Date.now();

			for (const req of requests) {
				const requestId = req.requestId as string;
				if (!requestId || this._seenRequestIds.has(requestId)) { continue; }
				this._seenRequestIds.add(requestId);

				const promptTokens = req.promptTokens as number | undefined;
				const completionTokens = req.completionTokens as number | undefined;

				// Only emit if we have actual token data
				if (promptTokens === undefined && completionTokens === undefined) { continue; }

				// ── Model & vendor ─────────────────────────────────────────
				// Prefer per-request modelId: when "Auto" mode routes to a specific model,
				// the session-level selectedModel.vendor may be "copilot" but the actual
				// per-request modelId has the correct vendor prefix.
				const reqModelId = (req.modelId as string) ?? (selectedModel?.identifier as string) ?? 'unknown';
				let reqVendor: string;

				if (reqModelId.includes('/')) {
					const prefix = reqModelId.split('/')[0];
					if (prefix === 'customendpoint') {
						// customendpoint/<provider>/<model> — the actual provider is the second segment
						reqVendor = resolveCustomEndpointVendor(reqModelId, sessionDetail);
					} else {
						reqVendor = prefix;
					}
				} else {
					reqVendor = sessionVendor ?? 'unknown';
				}

				// ── Extension ID ───────────────────────────────────────────
				// Per-request agent.extensionId tells which extension owned the agent
				// that processed this request. This is more specific than the session-level
				// model metadata (which just says which extension registered the model).
				// Example: { "value": "GitHub.copilot-chat", "_lower": "github.copilot-chat" }
				const reqAgent = req.agent as Record<string, unknown> | undefined;
				const reqExtensionId = extractExtensionId(reqAgent?.extensionId) ?? sessionExtensionId;

				// ── BYOK ───────────────────────────────────────────────────
				// isBYOK is derived from session-level metadata (the extension that registered
				// the model determines whether it's a BYOK model). Per-request BYOK flag is not
				// persisted in the chat session store.
				const reqBYOK = sessionIsBYOK;

				// ── Event ──────────────────────────────────────────────────
				const ev: ChatSessionStoreEvent = {
					timestamp: (req.timestamp as number) ?? sessionCreation,
					source: 'chat-session-store',
					sessionId: state.sessionId as string,
					requestId,
					model: reqModelId,
					vendor: reqVendor,
					isBYOK: reqBYOK,
					modelName: sessionModelName ?? 'unknown',
					modelFamily: sessionModelFamily ?? '',
					extensionId: reqExtensionId ?? '',
					promptTokens: promptTokens ?? 0,
					completionTokens: completionTokens ?? 0,
					elapsedMs: (req.elapsedMs as number) ?? 0,
				};

				for (const h of this._handlers) {
					h(ev);
				}
			}

			if (requests.length > 0) {
				this._log.debug(
					`ChatSessionStore: processed ${requests.filter(r => r.completionTokens != null || r.promptTokens != null).length} ` +
					`requests with tokens from ${path.basename(filePath)}`
				);
			}

			// Prune seen set periodically
			if (this._seenRequestIds.size > 10_000) {
				const arr = [...this._seenRequestIds];
				this._seenRequestIds.clear();
				for (const id of arr.slice(-5_000)) {
					this._seenRequestIds.add(id);
				}
			}

			this._saveState();
		} catch (err) {
			this._log.warn(
				`ChatSessionStore: error reading ${filePath}: ${
					err instanceof Error ? err.message : String(err)
				}`
			);
		}
	}

	// ── Reload ─────────────────────────────────────────────────────

	/**
	 * Force-reload all chat session files from scratch.
	 * Clears all seen request IDs and re-scans all known chatSessions directories.
	 */
	reloadAll(): void {
		this._log.info(
			`ChatSessionStore: reloading — clearing ${this._seenRequestIds.size} seen requests`
		);
		this._seenRequestIds.clear();
		void this._globalState.update('csw.seenRequestIds', undefined);
		// Re-scan known directories
		for (const dir of this._knownChatDirs) {
			this._scanChatDir(dir);
		}
		this._saveState();
		this._log.info('ChatSessionStore: reload complete');
	}

	// ── Dispose ────────────────────────────────────────────────────

	dispose(): void {
		this._saveState();
		for (const timer of this._debounceTimers.values()) { clearTimeout(timer); }
		this._debounceTimers.clear();
		// VS Code watchers are disposed automatically via context.subscriptions
	}
}
