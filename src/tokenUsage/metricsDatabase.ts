/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as sqlite3 from '@vscode/sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// ─── Row types ──────────────────────────────────────────────────────────────

export interface SessionRow {
	session_id: string;
	file_path: string;
	creation_date: number;
	initial_location: string | null;
	has_pending_edits: number;
	request_count: number;
	session_model_id: string | null;
	session_vendor: string | null;
	session_model_name: string | null;
	session_family: string | null;
	session_extension: string | null;
	session_is_byok: number;
}

export interface TurnRow {
	request_id: string;
	session_id: string;
	timestamp: number;
	completed_at: number | null;
	elapsed_ms: number | null;
	first_progress_ms: number | null;
	total_elapsed_ms: number | null;
	time_spent_waiting: number | null;
	model_id: string;
	vendor: string;
	model_name: string | null;
	resolved_model: string | null;
	agent_id: string | null;
	agent_extension: string | null;
	agent_name: string | null;
	prompt_tokens: number;
	completion_tokens: number;
	output_buffer: number | null;
	copilot_credits: number | null;
	// Flattened prompt token breakdown percentages (for pie charts)
	system_instructions_pct: number;
	tool_definitions_pct: number;
	messages_pct: number;
	files_pct: number;
	tool_results_pct: number;
	model_state: number;
	vote: number | null;
	user_message_length: number | null;
	user_message_parts: number;
	mode_kind: string | null;
	is_system_initiated: number;
	response_part_count: number;
	content_ref_count: number;
	code_citation_count: number;
	edited_file_count: number;
	followup_count: number;
	variable_count: number;
	tool_call_rounds: number;
	tool_call_count: number;
	thinking_tokens: number;
	estimated_cost_usd: number | null;
}

export interface ProcessedFileRow {
	file_path: string;
	file_size: number;
	file_mtime: number;
	content_hash: string;
	last_imported: number;
}

export interface DashboardSummary {
	today: DayTotal;
	thisWeek: DayTotal[];
	thisMonth: DayTotal[];
	allTime: {
		totalPromptTokens: number;
		totalCompletionTokens: number;
		totalCostUsd: number;
		firstTrackedDate: string;
		daysTracked: number;
		sessionCount: number;
		requestCount: number;
	};
	vendorBreakdown: VendorAgg[];
	modelBreakdown: ModelAgg[];
}

export interface DayTotal {
	date: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
	requestCount: number;
}

export interface VendorAgg {
	vendor: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	costUsd: number;
	requestCount: number;
}

export interface ModelAgg {
	modelId: string;
	promptTokens: number;
	completionTokens: number;
	costUsd: number;
	requestCount: number;
}

/** Daily totals grouped by (date, vendor) for stacked vendor time-series charts. */
export interface VendorDayTotal {
	date: string;
	vendor: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
	requestCount: number;
}

/** Daily totals grouped by (date, model_id) for per-model time-series charts. */
export interface ModelDayTotal {
	date: string;
	modelId: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
	requestCount: number;
}

/** Weighted-average prompt-token breakdown per model, weighted by prompt_tokens. */
export interface ModelPromptBreakdown {
	modelId: string;
	promptTokens: number;
	requestCount: number;
	avgSystemInstructionsPct: number;
	avgToolDefinitionsPct: number;
	avgMessagesPct: number;
	avgFilesPct: number;
	avgToolResultsPct: number;
}

// ─── DDL ────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS processed_files (
	file_path       TEXT PRIMARY KEY,
	file_size       INTEGER NOT NULL,
	file_mtime      INTEGER NOT NULL,
	content_hash    TEXT NOT NULL,
	last_imported   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
	session_id          TEXT PRIMARY KEY,
	file_path           TEXT NOT NULL UNIQUE,
	creation_date       INTEGER NOT NULL,
	initial_location    TEXT,
	has_pending_edits   INTEGER DEFAULT 0,
	request_count       INTEGER DEFAULT 0,
	session_model_id    TEXT,
	session_vendor      TEXT,
	session_model_name  TEXT,
	session_family      TEXT,
	session_extension   TEXT,
	session_is_byok     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS turns (
	request_id          TEXT PRIMARY KEY,
	session_id          TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
	timestamp           INTEGER NOT NULL,
	completed_at        INTEGER,
	elapsed_ms          INTEGER,
	first_progress_ms   INTEGER,
	total_elapsed_ms    INTEGER,
	time_spent_waiting  INTEGER,
	model_id            TEXT NOT NULL,
	vendor              TEXT NOT NULL,
	model_name          TEXT,
	resolved_model      TEXT,
	agent_id            TEXT,
	agent_extension     TEXT,
	agent_name          TEXT,
	prompt_tokens       INTEGER DEFAULT 0,
	completion_tokens   INTEGER DEFAULT 0,
	output_buffer       INTEGER,
	copilot_credits     REAL,
	-- Flattened prompt token breakdown percentages (for pie charts)
	system_instructions_pct INTEGER DEFAULT 0,
	tool_definitions_pct    INTEGER DEFAULT 0,
	messages_pct            INTEGER DEFAULT 0,
	files_pct               INTEGER DEFAULT 0,
	tool_results_pct        INTEGER DEFAULT 0,
	model_state         INTEGER DEFAULT 1,
	vote                INTEGER,
	user_message_length INTEGER,
	user_message_parts  INTEGER DEFAULT 1,
	mode_kind           TEXT,
	is_system_initiated INTEGER DEFAULT 0,
	response_part_count INTEGER DEFAULT 0,
	content_ref_count   INTEGER DEFAULT 0,
	code_citation_count INTEGER DEFAULT 0,
	edited_file_count   INTEGER DEFAULT 0,
	followup_count      INTEGER DEFAULT 0,
	variable_count      INTEGER DEFAULT 0,
	tool_call_rounds    INTEGER DEFAULT 0,
	tool_call_count     INTEGER DEFAULT 0,
	thinking_tokens     INTEGER DEFAULT 0,
	estimated_cost_usd  REAL
);

CREATE INDEX IF NOT EXISTS idx_turn_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turn_timestamp ON turns(timestamp);
CREATE INDEX IF NOT EXISTS idx_turn_vendor ON turns(vendor);
CREATE INDEX IF NOT EXISTS idx_turn_model ON turns(model_id);
CREATE INDEX IF NOT EXISTS idx_turn_agent ON turns(agent_id);
`;

// ─── Database class ─────────────────────────────────────────────────────────

/** Prefix all keys of obj with '@' for node-sqlite3 named-param binding. */
function toAtParams(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) { out[`@${k}`] = v; }
	return out;
}

export class MetricsDatabase {
	private _db: sqlite3.Database;
	private _ready: Promise<void>;
	private _closed = false;
	/** Serializes concurrent runInTransaction calls onto a single queue. */
	private _txQueue: Promise<unknown> = Promise.resolve();

	constructor(dbPath: string) {
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		this._db = new sqlite3.Database(dbPath);
		this._ready = new Promise<void>((resolve, reject) => {
			this._db.serialize(() => {
				this._db.run('PRAGMA journal_mode = WAL');
				this._db.run('PRAGMA synchronous = NORMAL');
				this._db.run('PRAGMA busy_timeout = 5000');
				this._db.exec(DDL, (err) => {
					if (err) { reject(err); } else { resolve(); }
				});
			});
		});
	}

	private _ensureOpen(): void {
		if (this._closed) { throw new Error('MetricsDatabase is closed'); }
	}

	// ── Low-level promise helpers ────────────────────────────────────────

	private _run(sql: string, params: unknown[] = []): Promise<void> {
		this._ensureOpen();
		return new Promise<void>((resolve, reject) => {
			this._db.run(sql, params, (err: Error | null) => {
				if (err) { reject(err); } else { resolve(); }
			});
		});
	}

	private _runNamed(sql: string, params: Record<string, unknown>): Promise<void> {
		this._ensureOpen();
		return new Promise<void>((resolve, reject) => {
			this._db.run(sql, toAtParams(params), (err: Error | null) => {
				if (err) { reject(err); } else { resolve(); }
			});
		});
	}

	private _get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
		this._ensureOpen();
		return new Promise<T | undefined>((resolve, reject) => {
			this._db.get(sql, params, (err: Error | null, row: T) => {
				if (err) { reject(err); } else { resolve(row); }
			});
		});
	}

	private _all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
		this._ensureOpen();
		return new Promise<T[]>((resolve, reject) => {
			this._db.all(sql, params, (err: Error | null, rows: T[]) => {
				if (err) { reject(err); } else { resolve(rows ?? []); }
			});
		});
	}

	// ── Transaction helper ───────────────────────────────────────────────

	async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
		await this._ready;
		const txWork = this._txQueue.then(async () => {
			await this._run('BEGIN IMMEDIATE');
			try {
				const result = await fn();
				await this._run('COMMIT');
				return result;
			} catch (err) {
				try { await this._run('ROLLBACK'); } catch { /* already rolled back */ }
				throw err;
			}
		});
		// Advance the queue regardless of success/failure so the next caller can proceed.
		this._txQueue = txWork.then(() => undefined, () => undefined);
		return txWork;
	}

	// ── File tracking ────────────────────────────────────────────────────

	async getProcessedFile(filePath: string): Promise<ProcessedFileRow | null> {
		await this._ready;
		return (await this._get<ProcessedFileRow>(
			'SELECT * FROM processed_files WHERE file_path = ?', [filePath]
		)) ?? null;
	}

	async markFileProcessed(
		filePath: string,
		size: number,
		mtime: number,
		hash: string
	): Promise<void> {
		await this._run(`
			INSERT INTO processed_files (file_path, file_size, file_mtime, content_hash, last_imported)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(file_path) DO UPDATE SET
				file_size = excluded.file_size,
				file_mtime = excluded.file_mtime,
				content_hash = excluded.content_hash,
				last_imported = excluded.last_imported
		`, [filePath, size, mtime, hash, Date.now()]);
	}

	async deleteFileRecord(filePath: string): Promise<void> {
		await this._run('DELETE FROM processed_files WHERE file_path = ?', [filePath]);
	}

	async findChangedFiles(candidates: Array<{ path: string; size: number; mtime: number }>): Promise<string[]> {
		await this._ready;
		const results = await Promise.all(
			candidates.map(c =>
				this.getProcessedFile(c.path).then(existing =>
					(!existing || existing.file_size !== c.size) ? c.path : null
				)
			)
		);
		return results.filter((r): r is string => r !== null);
	}

	// ── Data import ──────────────────────────────────────────────────────

	async upsertSession(row: SessionRow): Promise<void> {
		await this._runNamed(`
			INSERT INTO sessions (
				session_id, file_path, creation_date, initial_location,
				has_pending_edits, request_count, session_model_id, session_vendor,
				session_model_name, session_family, session_extension, session_is_byok
			) VALUES (
				@session_id, @file_path, @creation_date, @initial_location,
				@has_pending_edits, @request_count, @session_model_id, @session_vendor,
				@session_model_name, @session_family, @session_extension, @session_is_byok
			)
			ON CONFLICT(session_id) DO UPDATE SET
				file_path = excluded.file_path,
				creation_date = excluded.creation_date,
				initial_location = excluded.initial_location,
				has_pending_edits = excluded.has_pending_edits,
				request_count = excluded.request_count,
				session_model_id = excluded.session_model_id,
				session_vendor = excluded.session_vendor,
				session_model_name = excluded.session_model_name,
				session_family = excluded.session_family,
				session_extension = excluded.session_extension,
				session_is_byok = excluded.session_is_byok
		`, row as unknown as Record<string, unknown>);
	}

	async upsertTurn(row: TurnRow): Promise<void> {
		await this._runNamed(`
			INSERT INTO turns (
				request_id, session_id, timestamp, completed_at, elapsed_ms,
				first_progress_ms, total_elapsed_ms, time_spent_waiting,
				model_id, vendor, model_name, resolved_model,
				agent_id, agent_extension, agent_name,
				prompt_tokens, completion_tokens, output_buffer, copilot_credits,
				system_instructions_pct, tool_definitions_pct, messages_pct, files_pct, tool_results_pct,
				model_state, vote,
				user_message_length, user_message_parts,
				mode_kind, is_system_initiated,
				response_part_count, content_ref_count, code_citation_count,
				edited_file_count, followup_count, variable_count,
				tool_call_rounds, tool_call_count, thinking_tokens,
				estimated_cost_usd
			) VALUES (
				@request_id, @session_id, @timestamp, @completed_at, @elapsed_ms,
				@first_progress_ms, @total_elapsed_ms, @time_spent_waiting,
				@model_id, @vendor, @model_name, @resolved_model,
				@agent_id, @agent_extension, @agent_name,
				@prompt_tokens, @completion_tokens, @output_buffer, @copilot_credits,
				@system_instructions_pct, @tool_definitions_pct, @messages_pct, @files_pct, @tool_results_pct,
				@model_state, @vote,
				@user_message_length, @user_message_parts,
				@mode_kind, @is_system_initiated,
				@response_part_count, @content_ref_count, @code_citation_count,
				@edited_file_count, @followup_count, @variable_count,
				@tool_call_rounds, @tool_call_count, @thinking_tokens,
				@estimated_cost_usd
			)
			ON CONFLICT(request_id) DO UPDATE SET
				timestamp = excluded.timestamp,
				completed_at = excluded.completed_at,
				elapsed_ms = excluded.elapsed_ms,
				first_progress_ms = excluded.first_progress_ms,
				total_elapsed_ms = excluded.total_elapsed_ms,
				time_spent_waiting = excluded.time_spent_waiting,
				model_id = excluded.model_id,
				vendor = excluded.vendor,
				model_name = excluded.model_name,
				resolved_model = excluded.resolved_model,
				agent_id = excluded.agent_id,
				agent_extension = excluded.agent_extension,
				agent_name = excluded.agent_name,
				prompt_tokens = excluded.prompt_tokens,
				completion_tokens = excluded.completion_tokens,
				output_buffer = excluded.output_buffer,
				copilot_credits = excluded.copilot_credits,
				system_instructions_pct = excluded.system_instructions_pct,
				tool_definitions_pct = excluded.tool_definitions_pct,
				messages_pct = excluded.messages_pct,
				files_pct = excluded.files_pct,
				tool_results_pct = excluded.tool_results_pct,
				model_state = excluded.model_state,
				vote = excluded.vote,
				user_message_length = excluded.user_message_length,
				user_message_parts = excluded.user_message_parts,
				mode_kind = excluded.mode_kind,
				is_system_initiated = excluded.is_system_initiated,
				response_part_count = excluded.response_part_count,
				content_ref_count = excluded.content_ref_count,
				code_citation_count = excluded.code_citation_count,
				edited_file_count = excluded.edited_file_count,
				followup_count = excluded.followup_count,
				variable_count = excluded.variable_count,
				tool_call_rounds = excluded.tool_call_rounds,
				tool_call_count = excluded.tool_call_count,
				thinking_tokens = excluded.thinking_tokens,
				estimated_cost_usd = excluded.estimated_cost_usd
		`, row as unknown as Record<string, unknown>);
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this._run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
	}

	// ── Dashboard queries ────────────────────────────────────────────────

	private _completeFilter(extraWhere?: string): string {
		const base = 'model_state = 1 AND prompt_tokens > 0 AND completion_tokens > 0';
		return extraWhere ? `${base} AND ${extraWhere}` : base;
	}

	async getDayTotals(days: number): Promise<DayTotal[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		return this._all<DayTotal>(`
			SELECT
				date(timestamp / 1000, 'unixepoch') AS date,
				SUM(prompt_tokens) AS totalPromptTokens,
				SUM(completion_tokens) AS totalCompletionTokens,
				SUM(prompt_tokens + completion_tokens) AS totalTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS estimatedCostUsd,
				COUNT(*) AS requestCount
			FROM turns
			WHERE ${this._completeFilter('timestamp >= ?')}
			GROUP BY date
			ORDER BY date DESC
			LIMIT ?
		`, [cutoff, days]);
	}

	async getVendorBreakdown(days: number): Promise<VendorAgg[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		return this._all<VendorAgg>(`
			SELECT
				vendor,
				SUM(prompt_tokens) AS promptTokens,
				SUM(completion_tokens) AS completionTokens,
				SUM(prompt_tokens + completion_tokens) AS totalTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS costUsd,
				COUNT(*) AS requestCount
			FROM turns
			WHERE ${this._completeFilter('timestamp >= ?')}
			GROUP BY vendor
			ORDER BY totalTokens DESC
		`, [cutoff]);
	}

	async getModelBreakdown(days: number, vendor?: string): Promise<ModelAgg[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		const vendorFilter = vendor ? ' AND vendor = ?' : '';
		const params: unknown[] = [cutoff];
		if (vendor) { params.push(vendor); }
		return this._all<ModelAgg>(`
			SELECT
				model_id AS modelId,
				SUM(prompt_tokens) AS promptTokens,
				SUM(completion_tokens) AS completionTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS costUsd,
				COUNT(*) AS requestCount
			FROM turns
			WHERE ${this._completeFilter(`timestamp >= ?${vendorFilter}`)}
			GROUP BY model_id
			ORDER BY promptTokens + completionTokens DESC
		`, params);
	}

	async getDashboardSummary(days = 30): Promise<DashboardSummary> {
		await this._ready;

		const todayKey = new Date().toISOString().split('T')[0];
		const [weekTotals, monthTotals, vendorBreakdown, modelBreakdown] = await Promise.all([
			this.getDayTotals(7),
			this.getDayTotals(days),
			this.getVendorBreakdown(days),
			this.getModelBreakdown(days),
		]);

		const today = weekTotals.find(d => d.date === todayKey) ?? {
			date: todayKey,
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
			requestCount: 0,
		};

		const allTime = await this._get<{
			totalPromptTokens: number;
			totalCompletionTokens: number;
			totalCostUsd: number;
			firstTrackedDate: string | null;
		}>(`
			SELECT
				COALESCE(SUM(prompt_tokens), 0) AS totalPromptTokens,
				COALESCE(SUM(completion_tokens), 0) AS totalCompletionTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS totalCostUsd,
				MIN(date(timestamp / 1000, 'unixepoch')) AS firstTrackedDate
			FROM turns
			WHERE ${this._completeFilter()}
		`);

		const counts = await this._get<{ sessionCount: number; requestCount: number }>(`
			SELECT
				(SELECT COUNT(*) FROM sessions) AS sessionCount,
				(SELECT COUNT(*) FROM turns WHERE ${this._completeFilter()}) AS requestCount
		`);

		const safeAllTime = allTime ?? { totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, firstTrackedDate: null };
		const safeCounts = counts ?? { sessionCount: 0, requestCount: 0 };
		const firstDate = safeAllTime.firstTrackedDate ?? todayKey;
		const daysTracked = Math.max(1, Math.ceil(
			(new Date(todayKey).getTime() - new Date(firstDate).getTime()) / 86400000
		));

		return {
			today,
			thisWeek: weekTotals.slice(0, 7).reverse(),
			thisMonth: monthTotals.slice(0, days).reverse(),
			allTime: {
				totalPromptTokens: safeAllTime.totalPromptTokens,
				totalCompletionTokens: safeAllTime.totalCompletionTokens,
				totalCostUsd: safeAllTime.totalCostUsd,
				firstTrackedDate: firstDate,
				daysTracked,
				sessionCount: safeCounts.sessionCount,
				requestCount: safeCounts.requestCount,
			},
			vendorBreakdown,
			modelBreakdown,
		};
	}

	/** Daily totals grouped by vendor. Optionally filtered to a single vendor. */
	async getDayTotalsByVendor(days: number, vendor?: string): Promise<VendorDayTotal[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		const vendorFilter = vendor ? ' AND vendor = ?' : '';
		const params: unknown[] = [cutoff];
		if (vendor) { params.push(vendor); }
		params.push(days * 20);
		return this._all<VendorDayTotal>(`
			SELECT
				date(timestamp / 1000, 'unixepoch') AS date,
				vendor,
				SUM(prompt_tokens) AS totalPromptTokens,
				SUM(completion_tokens) AS totalCompletionTokens,
				SUM(prompt_tokens + completion_tokens) AS totalTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS estimatedCostUsd,
				COUNT(*) AS requestCount
			FROM turns
			WHERE ${this._completeFilter(`timestamp >= ?${vendorFilter}`)}
			GROUP BY date, vendor
			ORDER BY date DESC
			LIMIT ?
		`, params);
	}

	/** Daily totals grouped by model. Optionally filtered by vendor and/or a specific model. */
	async getDayTotalsByModel(days: number, vendor?: string, modelId?: string): Promise<ModelDayTotal[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		const conditions: string[] = [];
		const params: unknown[] = [cutoff];
		if (vendor) { conditions.push('vendor = ?'); params.push(vendor); }
		if (modelId) { conditions.push('model_id = ?'); params.push(modelId); }
		const extraFilter = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
		params.push(days * 30);
		return this._all<ModelDayTotal>(`
			SELECT
				date(timestamp / 1000, 'unixepoch') AS date,
				model_id AS modelId,
				SUM(prompt_tokens) AS totalPromptTokens,
				SUM(completion_tokens) AS totalCompletionTokens,
				SUM(prompt_tokens + completion_tokens) AS totalTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS estimatedCostUsd,
				COUNT(*) AS requestCount
			FROM turns
			WHERE ${this._completeFilter(`timestamp >= ?${extraFilter}`)}
			GROUP BY date, model_id
			ORDER BY date DESC
			LIMIT ?
		`, params);
	}

	/** Weighted-average prompt-token breakdown per model. Optionally filtered by vendor and/or model. */
	async getModelPromptBreakdown(days: number, vendor?: string, modelId?: string): Promise<ModelPromptBreakdown[]> {
		await this._ready;
		const cutoff = Date.now() - days * 86400000;
		const conditions: string[] = [];
		const params: unknown[] = [cutoff];
		if (vendor) { conditions.push('vendor = ?'); params.push(vendor); }
		if (modelId) { conditions.push('model_id = ?'); params.push(modelId); }
		const extraFilter = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
		return this._all<ModelPromptBreakdown>(`
			SELECT
				model_id AS modelId,
				SUM(prompt_tokens) AS promptTokens,
				COUNT(*) AS requestCount,
				CAST(SUM(prompt_tokens * system_instructions_pct) AS REAL) / NULLIF(SUM(prompt_tokens), 0) AS avgSystemInstructionsPct,
				CAST(SUM(prompt_tokens * tool_definitions_pct) AS REAL) / NULLIF(SUM(prompt_tokens), 0) AS avgToolDefinitionsPct,
				CAST(SUM(prompt_tokens * messages_pct) AS REAL) / NULLIF(SUM(prompt_tokens), 0) AS avgMessagesPct,
				CAST(SUM(prompt_tokens * files_pct) AS REAL) / NULLIF(SUM(prompt_tokens), 0) AS avgFilesPct,
				CAST(SUM(prompt_tokens * tool_results_pct) AS REAL) / NULLIF(SUM(prompt_tokens), 0) AS avgToolResultsPct
			FROM turns
			WHERE ${this._completeFilter(`timestamp >= ?${extraFilter}`)}
			GROUP BY model_id
			ORDER BY promptTokens DESC
		`, params);
	}

	async getSessionCount(): Promise<number> {
		await this._ready;
		return ((await this._get<{ c: number }>('SELECT COUNT(*) AS c FROM sessions'))?.c ?? 0);
	}

	async getRequestCount(): Promise<number> {
		await this._ready;
		return ((await this._get<{ c: number }>(`SELECT COUNT(*) AS c FROM turns WHERE ${this._completeFilter()}`))?.c ?? 0);
	}

	async getFirstTrackedDate(): Promise<{ firstTrackedDate: string } | null | undefined> {
		await this._ready;
		return this._get<{ firstTrackedDate: string }>(
			`SELECT MIN(date(timestamp / 1000, 'unixepoch')) AS firstTrackedDate FROM turns WHERE ${this._completeFilter()}`
		);
	}

	// ── Rebuild ──────────────────────────────────────────────────────────

	async clearAllData(): Promise<void> {
		await this._ready;
		await this._run('DELETE FROM turns');
		await this._run('DELETE FROM sessions');
		await this._run('DELETE FROM processed_files');
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	vacuum(): void {
		if (this._closed) { return; }
		this._db.run('VACUUM');
	}

	close(): void {
		if (this._closed) { return; }
		this._closed = true;
		this._db.close();
	}
}
