/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import Database from 'better-sqlite3';
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

export class MetricsDatabase {
	private _db: Database.Database;
	private _closed = false;

	constructor(dbPath: string) {
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		this._db = new Database(dbPath);
		this._db.pragma('journal_mode = WAL');
		this._db.pragma('synchronous = NORMAL');
		this._db.exec(DDL);
	}

	private _ensureOpen(): void {
		if (this._closed) {
			throw new Error('MetricsDatabase is closed');
		}
	}

	// ── Transaction helpers ──────────────────────────────────────────────

	beginTransaction(): void {
		this._ensureOpen();
		this._db.prepare('BEGIN IMMEDIATE').run();
	}

	commit(): void {
		this._ensureOpen();
		this._db.prepare('COMMIT').run();
	}

	rollback(): void {
		this._ensureOpen();
		this._db.prepare('ROLLBACK').run();
	}

	// ── File tracking ────────────────────────────────────────────────────

	getProcessedFile(filePath: string): ProcessedFileRow | null {
		this._ensureOpen();
		return this._db.prepare(
			'SELECT * FROM processed_files WHERE file_path = ?'
		).get(filePath) as ProcessedFileRow | undefined ?? null;
	}

	markFileProcessed(
		filePath: string,
		size: number,
		mtime: number,
		hash: string
	): void {
		this._ensureOpen();
		this._db.prepare(`
			INSERT INTO processed_files (file_path, file_size, file_mtime, content_hash, last_imported)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(file_path) DO UPDATE SET
				file_size = excluded.file_size,
				file_mtime = excluded.file_mtime,
				content_hash = excluded.content_hash,
				last_imported = excluded.last_imported
		`).run(filePath, size, mtime, hash, Date.now());
	}

	deleteFileRecord(filePath: string): void {
		this._ensureOpen();
		this._db.prepare('DELETE FROM processed_files WHERE file_path = ?').run(filePath);
	}

	/**
	 * Given a list of candidate .jsonl file paths, returns those that need
	 * import: files not yet in processed_files, or whose stored hash/size/mtime
	 * differs from the provided values.
	 */
	/**
	 * Returns files that need import: new files, or files whose size changed
	 * since last import. JSONL is append-only — size comparison is sufficient
	 * and avoids reading unchanged files.
	 */
	findChangedFiles(candidates: Array<{ path: string; size: number; mtime: number }>): string[] {
		this._ensureOpen();
		const changed: string[] = [];
		for (const c of candidates) {
			const existing = this.getProcessedFile(c.path);
			if (!existing) {
				changed.push(c.path);
				continue;
			}
		if (existing.file_size !== c.size) {
				changed.push(c.path);
			}
		}
		return changed;
	}

	// ── Data import ──────────────────────────────────────────────────────

	upsertSession(row: SessionRow): void {
		this._ensureOpen();
		const stmt = this._db.prepare(`
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
		`);
		stmt.run(row);
	}

	upsertTurn(row: TurnRow): void {
		this._ensureOpen();
		const stmt = this._db.prepare(`
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
		`);
		stmt.run(row);
	}

	deleteSession(sessionId: string): void {
		this._ensureOpen();
		this._db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
	}

	// ── Dashboard queries ────────────────────────────────────────────────

	private _completeFilter(extraWhere?: string): string {
		const base = 'model_state = 1 AND prompt_tokens > 0 AND completion_tokens > 0';
		return extraWhere ? `${base} AND ${extraWhere}` : base;
	}

	getDayTotals(days: number): DayTotal[] {
		this._ensureOpen();
		const cutoff = Date.now() - days * 86400000;
		return this._db.prepare(`
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
		`).all(cutoff, days) as DayTotal[];
	}

	getVendorBreakdown(days: number): VendorAgg[] {
		this._ensureOpen();
		const cutoff = Date.now() - days * 86400000;
		return this._db.prepare(`
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
		`).all(cutoff) as VendorAgg[];
	}

	getModelBreakdown(days: number, vendor?: string): ModelAgg[] {
		this._ensureOpen();
		const cutoff = Date.now() - days * 86400000;
		const vendorFilter = vendor ? ' AND vendor = ?' : '';
		const params: (number | string)[] = [cutoff];
		if (vendor) { params.push(vendor); }
		return this._db.prepare(`
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
		`).all(...params) as ModelAgg[];
	}

	getDashboardSummary(): DashboardSummary {
		this._ensureOpen();

		const todayKey = new Date().toISOString().split('T')[0];
		const weekTotals = this.getDayTotals(7);
		const monthTotals = this.getDayTotals(30);
		const vendorBreakdown = this.getVendorBreakdown(30);
		const modelBreakdown = this.getModelBreakdown(30);

		const today = weekTotals.find(d => d.date === todayKey) ?? {
			date: todayKey,
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
			requestCount: 0,
		};

		const allTime = this._db.prepare(`
			SELECT
				COALESCE(SUM(prompt_tokens), 0) AS totalPromptTokens,
				COALESCE(SUM(completion_tokens), 0) AS totalCompletionTokens,
				COALESCE(SUM(estimated_cost_usd), 0) AS totalCostUsd,
				MIN(date(timestamp / 1000, 'unixepoch')) AS firstTrackedDate
			FROM turns
			WHERE ${this._completeFilter()}
		`).get() as {
			totalPromptTokens: number;
			totalCompletionTokens: number;
			totalCostUsd: number;
			firstTrackedDate: string | null;
		};

		const counts = this._db.prepare(`
			SELECT
				(SELECT COUNT(*) FROM sessions) AS sessionCount,
				(SELECT COUNT(*) FROM turns WHERE ${this._completeFilter()}) AS requestCount
		`).get() as { sessionCount: number; requestCount: number };

		const firstDate = allTime.firstTrackedDate ?? todayKey;
		const daysTracked = Math.max(1, Math.ceil(
			(new Date(todayKey).getTime() - new Date(firstDate).getTime()) / 86400000
		));

		return {
			today,
			thisWeek: weekTotals.slice(0, 7).reverse(),
			thisMonth: monthTotals.slice(0, 30).reverse(),
			allTime: {
				totalPromptTokens: allTime.totalPromptTokens,
				totalCompletionTokens: allTime.totalCompletionTokens,
				totalCostUsd: allTime.totalCostUsd,
				firstTrackedDate: firstDate,
				daysTracked,
				sessionCount: counts.sessionCount,
				requestCount: counts.requestCount,
			},
			vendorBreakdown,
			modelBreakdown,
		};
	}

	getSessionCount(): number {
		this._ensureOpen();
		return (this._db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c;
	}

	getRequestCount(): number {
		this._ensureOpen();
		return (this._db.prepare(`SELECT COUNT(*) AS c FROM turns WHERE ${this._completeFilter()}`).get() as { c: number }).c;
	}

	// ── Rebuild ──────────────────────────────────────────────────────────

	clearAllData(): void {
		this._ensureOpen();
		this._db.prepare('DELETE FROM turns').run();
		this._db.prepare('DELETE FROM sessions').run();
		this._db.prepare('DELETE FROM processed_files').run();
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	vacuum(): void {
		this._ensureOpen();
		this._db.exec('VACUUM');
	}

	close(): void {
		if (this._closed) { return; }
		this._closed = true;
		this._db.close();
	}
}
