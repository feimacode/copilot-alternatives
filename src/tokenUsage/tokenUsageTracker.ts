/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatSessionStoreWatcher, ChatSessionStoreEvent } from './chatSessionStoreWatcher';
import { TokenUsageStorage, TokenSource, TrackedUsageEvent } from './tokenUsageStorage';
import { MetricsService } from './metricsService';
import { estimateCost, resolveModelPricingKey } from './tokenCostEstimator';
import { ILogService } from '../platform/log/common/logService';
import { CopilotEntitlement, resolveEntitlement } from './copilotEntitlement';

// ─── Constants ───────────────────────────────────────────────────────────────

const LIVE_WINDOW_MS = 5 * 60 * 1000;

// ─── Tracker ────────────────────────────────────────────────────────────────

/**
 * Central orchestrator for token usage tracking.
 * Single data source: ChatSessionStoreWatcher reading VS Code's
 * chatSessions/*.jsonl files, which contain ACTUAL token counts and
 * EXACT vendor/metadata from selectedModel.metadata.
 */
export class TokenUsageTracker implements vscode.Disposable {
	private readonly _storage: TokenUsageStorage;
	private readonly _metricsService: MetricsService;
	private readonly _chatSessionWatcher: ChatSessionStoreWatcher;
	private readonly _log: ILogService;

	// Live session counters (status bar)
	private _sessionTokens = 0;
	private _sessionCost = 0;

	// Event emitters
	private readonly _onDidUpdate: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	readonly onDidUpdate: vscode.Event<void> = this._onDidUpdate.event;

	private readonly _onDidChangeStored: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	readonly onDidChangeStored: vscode.Event<void> = this._onDidChangeStored.event;

	private readonly _onDidChangeEntitlement: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	readonly onDidChangeEntitlement: vscode.Event<void> = this._onDidChangeEntitlement.event;

	private _context: vscode.ExtensionContext | undefined;
	private _copilotEntitlement: CopilotEntitlement | undefined;
	private _vendorFlags: { copilotDetected: boolean; allCopilot: boolean } = { copilotDetected: false, allCopilot: false };

	constructor(globalState: vscode.Memento, globalStoragePath: string, logService: ILogService) {
		this._log = logService;
		const dbPath = path.join(globalStoragePath, 'copilot-alternatives-metrics.db');
		this._metricsService = new MetricsService(dbPath, logService.createSubLogger('Metrics'));
		this._storage = new TokenUsageStorage(globalState);
		this._chatSessionWatcher = new ChatSessionStoreWatcher(logService.createSubLogger('ChatStore'));
	}

	activate(context: vscode.ExtensionContext): void {
		this._context = context;

		// Purge stale globalState keys from retired tier-2/3 watchers
		void context.globalState.update('tw.logIds', undefined);
		void context.globalState.update('tw.logPositions', undefined);
		void context.globalState.update('tw.sessionIds', undefined);
		void context.globalState.update('tw.sessionPositions', undefined);

		// ── Activation order ─────────────────────────
		// 1. Quick import (deferred, non-blocking) — gets recent data into DB
		setImmediate(() => { void this._metricsService.quickImport()
			.then(() => this._refreshVendorFlags())
			.catch(err => this._log.warn(`Quick import failed: ${err instanceof Error ? err.message : String(err)}`))
		; });
		// 2. Background catch-up (async, non-blocking) — full historical data
		this._metricsService.backgroundImport()
			.then(() => this._refreshVendorFlags())
			.catch(err => this._log.warn(`Background import failed: ${err instanceof Error ? err.message : String(err)}`));

		// 3. File watcher for real-time updates
		this._chatSessionWatcher.setMetricsService(this._metricsService);
		this._chatSessionWatcher.activate(context);
		this._chatSessionWatcher.onEvent(event => this._onChatSessionStoreEvent(event));
	}

	/** Recomputes cached vendor-usage flags and, if Copilot usage is newly detected, attempts silent entitlement resolution. */
	private async _refreshVendorFlags(): Promise<void> {
		try {
			const wasDetected = this._vendorFlags.copilotDetected;
			this._vendorFlags = await this._metricsService.getVendorUsageFlags();
			if (this._vendorFlags.copilotDetected && !wasDetected) {
				void this._resolveEntitlementSilently();
			}
		} catch (err) {
			this._log.debug(`Vendor flags refresh failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async _resolveEntitlementSilently(): Promise<void> {
		if (!this._context) { return; }
		const entitlement = await resolveEntitlement(this._context, this._log, { interactive: false });
		if (entitlement) {
			this._copilotEntitlement = entitlement;
			this._onDidChangeEntitlement.fire();
		}
	}

	/** Interactively prompts GitHub sign-in (with popup) to (re)resolve Copilot entitlement. For use from an explicit command only. */
	async signInForCopilotEntitlement(): Promise<CopilotEntitlement | undefined> {
		if (!this._context) { return undefined; }
		const entitlement = await resolveEntitlement(this._context, this._log, { interactive: true, forceRefresh: true });
		if (entitlement) {
			this._copilotEntitlement = entitlement;
			this._onDidChangeEntitlement.fire();
		}
		return entitlement;
	}

	// ── Public API ──────────────────────────────────────────────────────────

	get sessionTokens(): number { return this._sessionTokens; }
	get sessionCost(): number { return this._sessionCost; }
	/** @deprecated Use metricsService instead for DB-backed queries */
	get storage(): TokenUsageStorage { return this._storage; }
	get metricsService(): MetricsService { return this._metricsService; }
	get copilotEntitlement(): CopilotEntitlement | undefined { return this._copilotEntitlement; }
	/** Cached vendor-usage flags, recomputed after each import pass (not on every call). */
	get vendorUsageFlags(): { copilotDetected: boolean; allCopilot: boolean } { return this._vendorFlags; }

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

		this._chatSessionWatcher.reloadAll();

		await this._refreshVendorFlags();

		this._log.info('ReloadAll: complete');
		this._onDidUpdate.fire();
		this._onDidChangeStored.fire();
	}

	// ── Event handlers ──────────────────────────────────────────────────────

	/**
	 * Handler: chat session store events carry EXACT token counts and
	 * FULL model metadata (vendor, isBYOK, name, family, extension). No
	 * heuristic inference needed.
	 */
	private _onChatSessionStoreEvent(event: ChatSessionStoreEvent): void {
		const isLive = (Date.now() - event.timestamp) < LIVE_WINDOW_MS;
		const pricingKey = resolveModelPricingKey(event.model);

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

	dispose(): void {
		this._chatSessionWatcher.dispose();
		this._onDidUpdate.dispose();
		this._onDidChangeStored.dispose();
	}
}
