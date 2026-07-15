/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CopilotSessionWatcher, SessionTokenEvent } from './copilotSessionWatcher';
import { CopilotLogWatcher, CopilotLogEvent } from './copilotLogWatcher';
import { ChatSessionStoreWatcher, ChatSessionStoreEvent } from './chatSessionStoreWatcher';
import { TokenUsageStorage, TokenSource, TrackedUsageEvent } from './tokenUsageStorage';
import { MetricsService } from './metricsService';
import { estimateCost, resolveModelPricingKey } from './tokenCostEstimator';
import { resolveVendor } from './vendorResolver';
import { ILogService } from '../platform/log/common/logService';

// ─── Deduplication ───────────────────────────────────────────────────────────

const LOG_DEDUP_WINDOW_MS = 10_000;
const LIVE_WINDOW_MS = 5 * 60 * 1000;
/**
 * Duration in ms. If a ChatSessionStore event exists for a model within this
 * window, session-watcher (events.jsonl) events for that model are suppressed
 * because chat sessions have strictly better metadata (exact vendor, isBYOK).
 */
const CHAT_SESSION_SUPPRESS_WINDOW_MS = 86_400_000; // 24 hours

interface RecentSessionEvent { model: string; timestamp: number; }

class TokenDeduplicator {
	private _recent: RecentSessionEvent[] = [];
	private _suppressed = 0;

	/** Record a live session event so log events for the same model are suppressed. */
	recordSession(model: string, ts: number): void {
		this._recent.push({ model, timestamp: ts });
		const cutoff = Date.now() - LOG_DEDUP_WINDOW_MS * 2;
		this._recent = this._recent.filter(e => e.timestamp > cutoff).slice(-200);
	}

	/** Check whether a log event should be suppressed (session data exists for same model). */
	shouldSuppressLog(model: string, ts: number): boolean {
		const resolved = resolveModelPricingKey(model);
		const now = Date.now();
		for (const se of this._recent) {
			if (resolveModelPricingKey(se.model) !== resolved) { continue; }
			if (Math.abs(ts - se.timestamp) < LOG_DEDUP_WINDOW_MS || Math.abs(now - se.timestamp) < LOG_DEDUP_WINDOW_MS) {
				this._suppressed++;
				return true;
			}
		}
		return false;
	}

	reset(): void {
		this._recent = [];
		this._suppressed = 0;
	}

	get suppressedCount(): number { return this._suppressed; }
}

// ─── Tracker ────────────────────────────────────────────────────────────────

/**
 * Central orchestrator with three-tier data source priority:
 *
 *   1. ChatSessionStoreWatcher — chatSessions/*.jsonl
 *      → ACTUAL token counts + EXACT vendor/metadata from `selectedModel.metadata`
 *      → Best accuracy, no heuristic inference needed
 *
 *   2. CopilotSessionWatcher  — events.jsonl
 *      → ACTUAL token counts, but heuristic-only vendor inference
 *      → Suppressed for models that ChatSessionStore already reported (24h window)
 *
 *   3. CopilotLogWatcher      — Copilot Chat log ccreq: lines
 *      → Duration-based ESTIMATES (not actual tokens)
 *      → Suppressed when session data exists for same model (20s window)
 */
export class TokenUsageTracker implements vscode.Disposable {
	private readonly _storage: TokenUsageStorage;
	private readonly _metricsService: MetricsService;
	private readonly _chatSessionWatcher: ChatSessionStoreWatcher;
	private readonly _sessionWatcher: CopilotSessionWatcher;
	private readonly _logWatcher: CopilotLogWatcher;
	private readonly _dedup = new TokenDeduplicator();
	private readonly _log: ILogService;

	/**
	 * Tracks the latest timestamp per pricing-key that ChatSessionStore has
	 * reported. Used to suppress events.jsonl events for the same model.
	 */
	private readonly _chatSessionTimestamps = new Map<string, number>();

	// Live session counters (status bar)
	private _sessionTokens = 0;
	private _sessionCost = 0;

	// Event emitters
	private readonly _onDidUpdate: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	readonly onDidUpdate: vscode.Event<void> = this._onDidUpdate.event;

	private readonly _onDidChangeStored: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	readonly onDidChangeStored: vscode.Event<void> = this._onDidChangeStored.event;

	constructor(globalState: vscode.Memento, globalStoragePath: string, logService: ILogService) {
		this._log = logService;
		const dbPath = path.join(globalStoragePath, 'copilot-alternatives-metrics.db');
		this._metricsService = new MetricsService(dbPath, logService.createSubLogger('Metrics'));
		this._storage = new TokenUsageStorage(globalState);
		this._chatSessionWatcher = new ChatSessionStoreWatcher(logService.createSubLogger('ChatStore'));
		this._sessionWatcher = new CopilotSessionWatcher(logService.createSubLogger('Session'));
		this._logWatcher = new CopilotLogWatcher(logService.createSubLogger('Log'));
	}

	activate(context: vscode.ExtensionContext): void {
		// ── Activation order ─────────────────────────────────────
		// 1. Quick import (deferred, non-blocking) — gets recent data into DB
		setImmediate(() => this._metricsService.quickImport());
		// 2. Background catch-up (async, non-blocking) — full historical data
		this._metricsService.backgroundImport().catch(err =>
			this._log.warn(`Background import failed: ${err instanceof Error ? err.message : String(err)}`)
		);

		// 3. File watchers for real-time updates
		this._chatSessionWatcher.setMetricsService(this._metricsService);
		this._chatSessionWatcher.activate(context);
		this._chatSessionWatcher.onEvent(event => this._onChatSessionStoreEvent(event));

		this._sessionWatcher.activate(context);
		this._sessionWatcher.onTokenEvent(event => this._onSessionEvent(event));

		this._logWatcher.activate(context);
		this._logWatcher.onLogEvent(event => this._onLogEvent(event));
	}

	// ── Public API ──────────────────────────────────────────────────────────

	get sessionTokens(): number { return this._sessionTokens; }
	get sessionCost(): number { return this._sessionCost; }
	/** @deprecated Use metricsService instead for DB-backed queries */
	get storage(): TokenUsageStorage { return this._storage; }
	get metricsService(): MetricsService { return this._metricsService; }

	/**
	 * Force-reload all existing data from disk. Resets all seen-event tracking
	 * and file positions, clears stored usage data, then re-scans and
	 * reprocesses every data source from scratch.
	 */
	async reloadAll(): Promise<void> {
		this._log.info('ReloadAll: resetting storage');
		await this._metricsService.rebuildAll();
		await this._storage.resetAll();

		this._sessionTokens = 0;
		this._sessionCost = 0;
		this._dedup.reset();
		this._chatSessionTimestamps.clear();

		this._chatSessionWatcher.reloadAll();
		this._sessionWatcher.reloadAll();
		this._logWatcher.reloadAll();

		this._log.info('ReloadAll: complete');
		this._onDidUpdate.fire();
		this._onDidChangeStored.fire();
	}

	// ── Event handlers ──────────────────────────────────────────────────────

	/**
	 * Tier 1 handler: chat session store events carry EXACT token counts and
	 * FULL model metadata (vendor, isBYOK, name, family, extension). No
	 * heuristic inference needed.
	 */
	private _onChatSessionStoreEvent(event: ChatSessionStoreEvent): void {
		const isLive = (Date.now() - event.timestamp) < LIVE_WINDOW_MS;
		const pricingKey = resolveModelPricingKey(event.model);

		// Record this model+timerange so tier 2 (events.jsonl) can be suppressed
		this._chatSessionTimestamps.set(pricingKey, event.timestamp);
		// Also record in the log dedup so tier 3 (log estimates) is suppressed
		this._dedup.recordSession(pricingKey, event.timestamp);

		this._log.trace(
			`ChatStore event: model=${event.model} vendor=${event.vendor} ` +
			`in=${event.promptTokens} out=${event.completionTokens} elapsed=${event.elapsedMs}ms ` +
			`byok=${event.isBYOK} live=${isLive}`
		);

		const tracked: TrackedUsageEvent = {
			timestamp: event.timestamp,
			vendor: event.vendor,       // exact from metadata — no heuristic!
			modelId: pricingKey,
			modelName: event.modelName,  // display name from metadata
			isBYOK: event.isBYOK,        // exact from metadata
			source: TokenSource.ApiReported,
			promptTokens: event.promptTokens,
			completionTokens: event.completionTokens,
			cachedTokens: 0,
			elapsedMs: event.elapsedMs,
		};

		const costUsd = estimateCost(event.promptTokens, event.completionTokens, 0, pricingKey).totalCost;
		this._storage.recordUsage(tracked, costUsd);

		if (isLive) {
			this._sessionTokens += event.promptTokens + event.completionTokens;
			this._sessionCost += costUsd;
		}

		this._onDidUpdate.fire();
		this._onDidChangeStored.fire();
	}

	/**
	 * Tier 2 handler: session-state events (events.jsonl) carry actual token
	 * counts but no vendor metadata. Suppressed when ChatSessionStore has
	 * already reported for the same model within CHAT_SESSION_SUPPRESS_WINDOW_MS.
	 */
	private _onSessionEvent(event: SessionTokenEvent): void {
		const model = event.model || 'unknown';
		const pricingKey = event.model ? resolveModelPricingKey(event.model) : 'gpt-4o';
		const isLive = (Date.now() - event.timestamp) < LIVE_WINDOW_MS;

		// Suppress if ChatSessionStore already reported this model recently
		const lastChatTs = this._chatSessionTimestamps.get(pricingKey);
		if (lastChatTs !== undefined && (event.timestamp - lastChatTs) < CHAT_SESSION_SUPPRESS_WINDOW_MS) {
			this._log.trace(
				`Session event SUPPRESSED: model=${model} (ChatSessionStore has more accurate data ` +
				`for ${pricingKey} at ${new Date(lastChatTs).toISOString()})`
			);
			return;
		}

		// Record so log events for the same model are suppressed
		this._dedup.recordSession(pricingKey, event.timestamp);

		// Determine source: zero input+output but non-zero premiumRequests → ContextWindow
		const isZero = event.inputTokens === 0 && event.outputTokens === 0;
		const source: TokenSource = isZero && event.premiumRequests > 0
			? TokenSource.ContextWindow
			: TokenSource.ApiReported;

		// Heuristic vendor when no metadata is available
		const vendor = event.model ? resolveVendor(event.model) : 'copilot';

		this._log.trace(
			`Session event: ${event.type} model=${model || '?'} vendor=${vendor} ` +
			`in=${event.inputTokens} out=${event.outputTokens} cache=${event.cacheReadTokens} ` +
			`source=${source} live=${isLive}`
		);

		const tracked: TrackedUsageEvent = {
			timestamp: event.timestamp,
			vendor,
			modelId: pricingKey,
			modelName: model,
			isBYOK: vendor !== 'copilot',
			source,
			promptTokens: event.inputTokens,
			completionTokens: event.outputTokens,
			cachedTokens: event.cacheReadTokens,
		};

		const costUsd = source === TokenSource.ApiReported
			? estimateCost(event.inputTokens, event.outputTokens, event.cacheReadTokens, pricingKey).totalCost
			: 0;

		this._storage.recordUsage(tracked, costUsd);

		if (isLive && source === TokenSource.ApiReported) {
			this._sessionTokens += event.inputTokens + event.outputTokens;
			this._sessionCost += costUsd;
		}

		this._onDidUpdate.fire();
		this._onDidChangeStored.fire();
	}

	/**
	 * Tier 3 handler: log-based estimates. Only used when neither tier 1 nor
	 * tier 2 has data. Suppressed by the TokenDeduplicator when session events
	 * (tier 1 or 2) exist for the same model.
	 */
	private _onLogEvent(event: CopilotLogEvent): void {
		if (this._dedup.shouldSuppressLog(event.entry.model, event.timestamp)) {
			this._log.trace(
				`Log event SUPPRESSED: model=${event.entry.model} ` +
				`duration=${event.entry.durationMs}ms (dedup with session/chat event)`
			);
			return;
		}

		const pricingKey = resolveModelPricingKey(event.entry.model);
		const vendor = resolveVendor(event.entry.model);
		const isLive = (Date.now() - event.timestamp) < LIVE_WINDOW_MS;

		this._log.trace(
			`Log event: model=${event.entry.model} vendor=${vendor} ` +
			`duration=${event.entry.durationMs}ms estOut=${event.estimatedOutputTokens} ` +
			`estIn=${event.estimatedInputTokens} live=${isLive}`
		);

		const tracked: TrackedUsageEvent = {
			timestamp: event.timestamp,
			vendor,
			modelId: pricingKey,
			modelName: event.entry.model,
			isBYOK: vendor !== 'copilot',
			source: TokenSource.ApiReported,
			promptTokens: event.estimatedInputTokens,
			completionTokens: event.estimatedOutputTokens,
			cachedTokens: 0,
		};

		const costUsd = estimateCost(event.estimatedInputTokens, event.estimatedOutputTokens, 0, pricingKey).totalCost;
		this._storage.recordUsage(tracked, costUsd);

		if (isLive) {
			this._sessionTokens += event.estimatedInputTokens + event.estimatedOutputTokens;
			this._sessionCost += costUsd;
		}

		this._onDidUpdate.fire();
		this._onDidChangeStored.fire();
	}

	dispose(): void {
		this._chatSessionWatcher.dispose();
		this._sessionWatcher.dispose();
		this._logWatcher.dispose();
		this._onDidUpdate.dispose();
		this._onDidChangeStored.dispose();
	}
}
