/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MetricsDatabase, DashboardSummary, VendorAgg, ModelAgg, ModelDayTotal, ModelPromptBreakdown, SessionSummary, SessionDetail, SessionFilterOptions } from './metricsDatabase';
import { parseSessionFile, computeFileHash, ParsedSession } from './sessionStoreImporter';
import { estimateCost, resolveModelPricingKey } from './tokenCostEstimator';
import { ILogService } from '../platform/log/common/logService';

// ─── WSL detection ──────────────────────────────────────────────────────────

let _isWsl: boolean | undefined;

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
		roots.push(
			path.join(home, '.config', 'Code', 'User', 'workspaceStorage'),
			path.join(home, '.config', 'Code - Insiders', 'User', 'workspaceStorage'),
			path.join(home, '.config', 'code-oss-dev', 'User', 'workspaceStorage'),
		);

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

	roots.push(
		path.join(home, '.vscode-server', 'data', 'User', 'workspaceStorage'),
		path.join(home, '.vscode-server-insiders', 'data', 'User', 'workspaceStorage'),
	);

	roots.push(
		path.join(home, '.vscode-oss-dev', 'User', 'workspaceStorage'),
	);

	return roots;
}

// ─── Backfill window ───────────────────────────────────────────────────────

const SETTING_BACKFILL_DAYS = 'copilotAlternatives.tokenUsage.backfillDays';
const DEFAULT_BACKFILL_DAYS = 60;

/**
 * Returns the epoch-ms cutoff for files to import. Files with mtime older
 * than this are skipped during enumeration. Controlled by the
 * `copilotAlternatives.tokenUsage.backfillDays` setting (default 60).
 */
function getBackfillCutoffMs(): number {
	const days = vscode.workspace.getConfiguration()
		.get<number>(SETTING_BACKFILL_DAYS, DEFAULT_BACKFILL_DAYS);
	return Date.now() - (days * 86400000);
}

// ─── File candidate enumeration ─────────────────────────────────────────────

interface FileCandidate {
	path: string;
	size: number;
	mtime: number;
}

function enumerateAllJsonlFiles(log: ILogService): FileCandidate[] {
	const candidates: FileCandidate[] = [];
	const roots = getWorkspaceStorageRoots(os.homedir());
	const seen = new Set<string>();
	const cutoffMs = getBackfillCutoffMs();

	for (const root of roots) {
		try {
			if (!fs.existsSync(root)) { continue; }
			const wsEntries = fs.readdirSync(root, { withFileTypes: true });
			for (const wsEntry of wsEntries) {
				if (!wsEntry.isDirectory()) { continue; }
				const chatDir = path.join(root, wsEntry.name, 'chatSessions');
				if (!fs.existsSync(chatDir)) { continue; }

				try {
					const files = fs.readdirSync(chatDir).filter(f => f.endsWith('.jsonl'));
					for (const file of files) {
						const fp = path.join(chatDir, file);
						if (seen.has(fp)) { continue; }
						seen.add(fp);
						try {
							const stat = fs.statSync(fp);
							if (stat.size === 0) { continue; }
							// Skip files older than the backfill window
							if (stat.mtimeMs < cutoffMs) { continue; }
							// Do NOT read content or compute hash here.
							// JSONL is append-only — file size is a sufficient
							// change detector for knowing whether something changed.
							candidates.push({
								path: fp,
								size: stat.size,
								mtime: stat.mtimeMs,
							});
						} catch {
							// skip inaccessible files
						}
					}
				} catch {
					// skip inaccessible chatSessions dirs
				}
			}
		} catch {
			// skip inaccessible roots
		}
	}

	return candidates;
}

function findMostRecentWorkspaceDir(log: ILogService): FileCandidate[] {
	const candidates: FileCandidate[] = [];
	const roots = getWorkspaceStorageRoots(os.homedir());
	let newestDir = '';
	let newestMtime = 0;

	for (const root of roots) {
		try {
			if (!fs.existsSync(root)) { continue; }
			const wsEntries = fs.readdirSync(root, { withFileTypes: true });
			for (const wsEntry of wsEntries) {
				if (!wsEntry.isDirectory()) { continue; }
				const chatDir = path.join(root, wsEntry.name, 'chatSessions');
				if (!fs.existsSync(chatDir)) { continue; }
				try {
					const stat = fs.statSync(chatDir);
					if (stat.mtimeMs > newestMtime) {
						newestMtime = stat.mtimeMs;
						newestDir = chatDir;
					}
				} catch { /* skip */ }
			}
		} catch { /* skip */ }
	}

	if (!newestDir) { return candidates; }

	// Return up to 5 most recent files from the newest directory
	try {
		const files = fs.readdirSync(newestDir)
			.filter(f => f.endsWith('.jsonl'))
			.map(f => {
				const fp = path.join(newestDir, f);
				const st = fs.statSync(fp);
				return { path: fp, size: st.size, mtime: st.mtimeMs };
			})
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, 5);

		candidates.push(...files);
	} catch { /* skip */ }

	return candidates;
}

// ─── MetricsService ─────────────────────────────────────────────────────────

export class MetricsService implements vscode.Disposable {
	private _db: MetricsDatabase;
	private _log: ILogService;

	constructor(dbPath: string, log: ILogService) {
		this._log = log;
		this._db = new MetricsDatabase(dbPath);
	}

	/**
	 * Returns the configured backfill window in days from settings,
	 * or the default (60 days).
	 */
	protected _backfillDays(): number {
		return vscode.workspace.getConfiguration()
			.get<number>(SETTING_BACKFILL_DAYS, DEFAULT_BACKFILL_DAYS);
	}

	// ── Layer 1: Quick batch (async, <500ms) ──────────────────────────

	async quickImport(): Promise<void> {
		const days = this._backfillDays();
		this._log.info(`MetricsService: quick import (backfill: ${days} days)`);
		const candidates = findMostRecentWorkspaceDir(this._log);
		if (candidates.length === 0) {
			this._log.debug('MetricsService: no files found for quick import');
			return;
		}

		const startTime = Date.now();
		let imported = 0;

		try {
			await this._db.runInTransaction(async () => {
				for (const c of candidates) {
					const parsed = parseSessionFile(c.path);
					if (!parsed) { continue; }

					// Estimate costs for each request
					for (const req of parsed.turnRows) {
						req.estimated_cost_usd = estimateCost(
							req.prompt_tokens,
							req.completion_tokens,
							0,
							resolveModelPricingKey(req.model_id)
						).totalCost;
					}

					await this._db.upsertSession(parsed.sessionRow);
					for (const req of parsed.turnRows) {
						await this._db.upsertTurn(req);
					}
					await this._db.markFileProcessed(c.path, parsed.fileSize, parsed.fileMtime, parsed.fileHash);
					imported++;
				}
			});
		} catch (err) {
			this._log.warn(`MetricsService: quick import failed: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}

		const elapsed = Date.now() - startTime;
		this._log.info(`MetricsService: quick import done — ${imported} files in ${elapsed}ms`);
	}

	// ── Layer 2: Background catch-up (async, ~2-5s) ─────────────────────

	async backgroundImport(): Promise<void> {
		const days = this._backfillDays();
		const startTime = Date.now();

		// Use setImmediate to yield between batches
		await new Promise<void>(resolve => {
			setImmediate(async () => {
				try {
					const allFiles = enumerateAllJsonlFiles(this._log);
					if (allFiles.length === 0) {
						this._log.debug('MetricsService: no files for background import');
						resolve();
						return;
					}

					const changedFiles = await this._db.findChangedFiles(allFiles);
					this._log.info(`MetricsService: background import — ${allFiles.length} files total, ${changedFiles.length} changed`);

					let imported = 0;
					const BATCH_SIZE = 10;

					for (let i = 0; i < changedFiles.length; i += BATCH_SIZE) {
						const batch = changedFiles.slice(i, i + BATCH_SIZE);

						try {
							await this._db.runInTransaction(async () => {
								for (const fp of batch) {
									const parsed = parseSessionFile(fp);
									if (!parsed) { continue; }

									for (const req of parsed.turnRows) {
										req.estimated_cost_usd = estimateCost(
											req.prompt_tokens,
											req.completion_tokens,
											0,
											resolveModelPricingKey(req.model_id)
										).totalCost;
									}

									await this._db.upsertSession(parsed.sessionRow);
									for (const req of parsed.turnRows) {
										await this._db.upsertTurn(req);
									}
									await this._db.markFileProcessed(parsed.filePath, parsed.fileSize, parsed.fileMtime, parsed.fileHash);
									imported++;
								}
							});
						} catch (err) {
							this._log.warn(`MetricsService: batch ${i / BATCH_SIZE + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
						}

						// Yield to event loop every batch
						await new Promise<void>(r => setImmediate(r));
					}

					const elapsed = Date.now() - startTime;
					this._log.info(`MetricsService: background import done — ${imported} files imported in ${elapsed}ms`);
				} catch (err) {
					this._log.warn(`MetricsService: background import failed: ${err instanceof Error ? err.message : String(err)}`);
				}
				resolve();
			});
		});
	}

	// ── Layer 3: Incremental file import (for fs.watch) ──────────────────

	/**
	 * Imports a single .jsonl file if it's new or changed since the last import.
	 * JSONL is append-only, so file size comparison is a sufficient change detector.
	 * Returns true if the file was actually imported, false if it was skipped
	 * (unchanged, empty, or unparseable).
	 */
	async importSingleFile(filePath: string): Promise<boolean> {
		try {
			// Quick skip: check if file is already tracked and unchanged
			const stat = fs.statSync(filePath);
			if (stat.size === 0) { return false; }

			const existing = await this._db.getProcessedFile(filePath);
			if (existing && existing.file_size === stat.size) {
				this._log.debug(`MetricsService: skipped ${path.basename(filePath)} (already processed, size=${stat.size})`);
				return false;
			}

			const parsed = parseSessionFile(filePath);
			if (!parsed) { return false; }

			for (const req of parsed.turnRows) {
				req.estimated_cost_usd = estimateCost(
					req.prompt_tokens,
					req.completion_tokens,
					0,
					resolveModelPricingKey(req.model_id)
				).totalCost;
			}

			await this._db.runInTransaction(async () => {
				await this._db.upsertSession(parsed.sessionRow);
				for (const req of parsed.turnRows) {
					await this._db.upsertTurn(req);
				}
				await this._db.markFileProcessed(parsed.filePath, parsed.fileSize, parsed.fileMtime, parsed.fileHash);
			});

			this._log.debug(`MetricsService: imported ${path.basename(filePath)} (${parsed.turnRows.length} requests)`);
			return true;
		} catch (err) {
			this._log.warn(`MetricsService: import failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
	}

	// ── Rebuild ──────────────────────────────────────────────────────────

	// Rebuild all data from disk within the configured backfill window.
	// Uses the copilotAlternatives.tokenUsage.backfillDays setting.
	async rebuildAll(): Promise<void> {
		const days = this._backfillDays();
		this._log.info(`MetricsService: rebuilding all data (backfill: ${days} days)...`);
		await this._db.clearAllData();

		const allFiles = enumerateAllJsonlFiles(this._log);
		this._log.info(`MetricsService: rebuilding from ${allFiles.length} files`);

		const BATCH_SIZE = 10;
		let imported = 0;

		for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
			const batch = allFiles.slice(i, i + BATCH_SIZE);

			try {
				await this._db.runInTransaction(async () => {
						for (const c of batch) {
							const parsed = parseSessionFile(c.path);
							if (!parsed) { continue; }

							for (const req of parsed.turnRows) {
								req.estimated_cost_usd = estimateCost(
									req.prompt_tokens,
									req.completion_tokens,
									0,
									resolveModelPricingKey(req.model_id)
								).totalCost;
							}

							await this._db.upsertSession(parsed.sessionRow);
							for (const req of parsed.turnRows) {
								await this._db.upsertTurn(req);
							}
							await this._db.markFileProcessed(c.path, c.size, c.mtime, parsed.fileHash);
							imported++;
						}
				});
			} catch (err) {
				this._log.warn(`MetricsService: rebuild batch failed: ${err instanceof Error ? err.message : String(err)}`);
			}

			await new Promise<void>(r => setImmediate(r));
		}

		this._log.info(`MetricsService: rebuild complete — ${imported} files imported`);
	}

	// ── Dashboard queries ────────────────────────────────────────────────

	async getDashboardSummary(days = 30): Promise<DashboardSummary> {
		return this._db.getDashboardSummary(days);
	}

	/** Vendor breakdown for the last 7 days, ordered by total tokens descending. */
	async getVendorBreakdown7d(): Promise<VendorAgg[]> {
		return this._db.getVendorBreakdown(7);
	}

	/** Model breakdown for the last 7 days, optionally filtered by vendor. */
	async getModelBreakdown7d(vendor?: string): Promise<ModelAgg[]> {
		return this._db.getModelBreakdown(7, vendor);
	}

	async getSessionCount(): Promise<number> {
		return this._db.getSessionCount();
	}

	async getRequestCount(): Promise<number> {
		return this._db.getRequestCount();
	}

	// ── Vendor & Model View summaries ───────────────────────────────────

	/** Vendor view summary scoped to a single vendor. */
	async getVendorViewSummary(vendor: string, days = 30): Promise<{ models: ModelAgg[]; dailyByModel: ModelDayTotal[]; allTimeTokens: number; allTimeRequests: number; firstTrackedDate: string | null }> {
		const [models, dailyByModel, allVendors, firstDateRow] = await Promise.all([
			this._db.getModelBreakdown(days, vendor),
			this._db.getDayTotalsByModel(days, vendor),
			this._db.getDayTotalsByVendor(days, vendor),
			this._db.getFirstTrackedDate(),
		]);
		const allTimeTokens = allVendors.reduce((s, d) => s + d.totalTokens, 0);
		const allTimeRequests = allVendors.reduce((s, d) => s + d.requestCount, 0);
		return { models, dailyByModel, allTimeTokens, allTimeRequests, firstTrackedDate: firstDateRow?.firstTrackedDate ?? null };
	}

	/** Model view summary. Optionally filtered by vendor/model and time range. */
	async getModelViewSummary(vendor?: string, modelId?: string, days = 30): Promise<{ models: ModelAgg[]; dailyByModel: ModelDayTotal[]; promptBreakdowns: ModelPromptBreakdown[]; firstTrackedDate: string | null }> {
		const [models, dailyByModel, promptBreakdowns, firstDateRow] = await Promise.all([
			this._db.getModelBreakdown(days, vendor),
			this._db.getDayTotalsByModel(days, vendor, modelId),
			this._db.getModelPromptBreakdown(days, vendor, modelId),
			this._db.getFirstTrackedDate(),
		]);
		return { models, dailyByModel, promptBreakdowns, firstTrackedDate: firstDateRow?.firstTrackedDate ?? null };
	}

	/** List of all distinct vendors with usage in last 30 days. */
	async getAllVendors(): Promise<string[]> {
		const vendors = await this._db.getVendorBreakdown(30);
		return vendors.map(v => v.vendor).sort();
	}

	// ── Session list / detail queries ───────────────────────────────────

	async listSessions(
		days: number,
		filters?: { modelName?: string },
	): Promise<SessionSummary[]> {
		return this._db.listSessions(days, filters);
	}

	async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
		return this._db.getSessionDetail(sessionId);
	}

	async getSessionFilterOptions(): Promise<SessionFilterOptions> {
		return this._db.getSessionFilterOptions();
	}

	// ── Dispose ──────────────────────────────────────────────────────────

	dispose(): void {
		this._db.close();
	}
}
