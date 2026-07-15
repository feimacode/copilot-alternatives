/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SessionRow, TurnRow } from './metricsDatabase';
import { ILogService } from '../platform/log/common/logService';

// ─── Mutation log types ─────────────────────────────────────────────────────

interface MutationEntry {
	kind: 0 | 1 | 2 | 3;
	v?: unknown;
	k?: (string | number)[];
	i?: number;
}

// ─── State reconstruction ───────────────────────────────────────────────────

function setAtPath(state: Record<string, unknown>, pathArr: (string | number)[], value: unknown): void {
	let current: Record<string, unknown> = state;
	for (let i = 0; i < pathArr.length - 1; i++) {
		const seg = pathArr[i];
		current = current[seg] as Record<string, unknown>;
		if (!current) { return; }
	}
	current[pathArr[pathArr.length - 1]] = value;
}

function pushToArray(state: Record<string, unknown>, pathArr: (string | number)[], values: unknown[] | undefined, startIndex: number | undefined): void {
	let current: Record<string, unknown> = state;
	for (let i = 0; i < pathArr.length - 1; i++) {
		const seg = pathArr[i];
		current = current[seg] as Record<string, unknown>;
		if (!current) { return; }
	}
	const arrayKey = pathArr[pathArr.length - 1];
	const arr = (current[arrayKey] as unknown[]) ?? [];
	if (startIndex !== undefined) {
		arr.length = startIndex;
	}
	if (values && values.length > 0) {
		arr.push(...values);
	}
	current[arrayKey] = arr;
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

// ─── Vendor resolution ──────────────────────────────────────────────────────

/**
 * Resolves the actual vendor from a model ID.
 *
 * Priority:
 * 1. If modelId has a "/" prefix, the part before "/" is the vendor.
 * 2. Special case: `customendpoint/<provider>/<model>` → vendor = `<provider>` (2nd segment)
 * 3. Falls back to `detail` from session metadata for custom endpoints, then to `"unknown"`.
 */
function resolveVendorFromModelId(modelId: string, sessionDetail?: string): string {
	if (!modelId.includes('/')) {
		return 'unknown';
	}

	const parts = modelId.split('/');
	const prefix = parts[0];

	if (prefix === 'customendpoint') {
		if (parts.length >= 3) {
			const provider = parts[1].trim();
			if (provider.length > 0) { return provider; }
		}
		return sessionDetail ?? 'customendpoint';
	}

	return prefix;
}

// ─── Extension ID extraction ────────────────────────────────────────────────

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

// ─── Array field counting ───────────────────────────────────────────────────

interface ArrayCounts {
	responsePartCount: number;
	contentRefCount: number;
	codeCitationCount: number;
	editedFileCount: number;
	followupCount: number;
	variableCount: number;
}

function countArrays(req: Record<string, unknown>): ArrayCounts {
	return {
		responsePartCount: (req.response as unknown[])?.length ?? 0,
		contentRefCount: (req.contentReferences as unknown[])?.length ?? 0,
		codeCitationCount: (req.codeCitations as unknown[])?.length ?? 0,
		editedFileCount: (req.editedFileEvents as unknown[])?.length ?? 0,
		followupCount: (req.followups as unknown[])?.length ?? 0,
		variableCount: (
			(req.variableData as Record<string, unknown>)?.variables as unknown[]
		)?.length ?? 0,
	};
}

// ─── Tool call round counting from result.metadata ─────────────────────────

function countToolCallRounds(resultObj: Record<string, unknown> | undefined): {
	rounds: number; calls: number; thinkingTokens: number;
} {
	const meta = resultObj?.metadata as Record<string, unknown> | undefined;
	const rounds = meta?.toolCallRounds as Array<Record<string, unknown>> | undefined;
	if (!rounds || rounds.length === 0) {
		return { rounds: 0, calls: 0, thinkingTokens: 0 };
	}

	let totalCalls = 0;
	let totalThinkingTokens = 0;
	for (const round of rounds) {
		const toolCalls = round.toolCalls as unknown[] | undefined;
		if (toolCalls) { totalCalls += toolCalls.length; }
		const thinking = round.thinking as Record<string, unknown> | undefined;
		if (thinking && typeof thinking.tokens === 'number') {
			totalThinkingTokens += thinking.tokens;
		}
	}

	return { rounds: rounds.length, calls: totalCalls, thinkingTokens: totalThinkingTokens };
}

// ─── File hash ──────────────────────────────────────────────────────────────

export function computeFileHash(content: string): string {
	return crypto.createHash('sha256').update(content).digest('hex');
}

// ─── Parsed types ──────────────────────────────────────────────────────────

export interface ParsedSession {
	sessionRow: SessionRow;
	turnRows: TurnRow[];
	filePath: string;
	fileSize: number;
	fileMtime: number;
	fileHash: string;
}

// ─── Main extraction ────────────────────────────────────────────────────────

/**
 * Parses a single chat session JSONL file and extracts flattened metrics
 * for the session and all its requests.
 *
 * Returns null if the file has no session ID or no requests with token data.
 */
export function parseSessionFile(filePath: string): ParsedSession | null {
	const stat = fs.statSync(filePath);
	if (stat.size === 0) { return null; }

	const content = fs.readFileSync(filePath, 'utf8');
	const entries = parseMutationLog(content);
	if (entries.length === 0) { return null; }

	const state = reconstructState(entries);
	if (!state || !state.sessionId || !state.requests) { return null; }

	const requests = state.requests as Record<string, unknown>[];

	// ── Session-level metadata ──────────────────────────────────────────

	const inputState = state.inputState as Record<string, unknown> | undefined;
	const selectedModel = inputState?.selectedModel as Record<string, unknown> | undefined;
	const metaData = selectedModel?.metadata as Record<string, unknown> | undefined;

	const sessionVendor = (metaData?.vendor as string) ?? undefined;
	const sessionBYOK = !!(metaData?.isBYOK);
	const sessionModelName = (metaData?.name as string) ?? undefined;
	const sessionFamily = (metaData?.family as string) ?? undefined;
	const sessionDetail = (metaData?.detail as string) ?? undefined;
	const sessionExtension = extractExtensionId(metaData?.extension);

	const sessionRow: SessionRow = {
		session_id: state.sessionId as string,
		file_path: filePath,
		creation_date: (state.creationDate as number) ?? 0,
		initial_location: (state.initialLocation as string) ?? null,
		has_pending_edits: state.hasPendingEdits ? 1 : 0,
		request_count: requests.length,
		session_model_id: (selectedModel?.identifier as string) ?? null,
		session_vendor: sessionVendor ?? null,
		session_model_name: sessionModelName ?? null,
		session_family: sessionFamily ?? null,
		session_extension: sessionExtension ?? null,
		session_is_byok: sessionBYOK ? 1 : 0,
	};

	// ── Per-request extraction ──────────────────────────────────────────

	const turnRows: TurnRow[] = [];
	for (const req of requests) {
		const requestId = req.requestId as string;
		if (!requestId) { continue; }

		const promptTokens = (req.promptTokens as number) ?? 0;
		const completionTokens = (req.completionTokens as number) ?? 0;

		// Skip requests with no token data at all
		if (promptTokens === 0 && completionTokens === 0) { continue; }

		// ── Model & vendor ────────────────────────────────────────────
		const reqModelId = (req.modelId as string) ?? (selectedModel?.identifier as string) ?? 'unknown';
		const reqVendor = resolveVendorFromModelId(reqModelId, sessionDetail);

		// ── Agent ──────────────────────────────────────────────────────
		const agent = req.agent as Record<string, unknown> | undefined;
		const agentId = (agent?.id as string) ?? null;
		const agentExtension = extractExtensionId(agent?.extensionId) ?? sessionExtension ?? null;
		const agentName = (agent?.name as string) ?? null;

		// ── Timing from result ─────────────────────────────────────────
		const resultObj = req.result as Record<string, unknown> | undefined;
		const timings = resultObj?.timings as Record<string, unknown> | undefined;
		const resultMeta = resultObj?.metadata as Record<string, unknown> | undefined;
		const firstProgressMs = (timings?.firstProgress as number) ?? null;
		const totalElapsedMs = (timings?.totalElapsed as number) ?? null;
		const resolvedModel = (resultMeta?.resolvedModel as string) ?? null;

		// ── Tool call rounds ───────────────────────────────────────────
		const tcr = countToolCallRounds(resultObj);

		// ── Array counts ───────────────────────────────────────────────
		const counts = countArrays(req);

		// ── Message ────────────────────────────────────────────────────
		const message = req.message as Record<string, unknown> | undefined;
		const messageText = (message?.text as string) ?? '';
		const messageParts = message?.parts as unknown[] | undefined;

		// ── Model state ────────────────────────────────────────────────
		const modelStateObj = req.modelState as Record<string, unknown> | undefined;
		const modelState = (modelStateObj?.value as number) ?? 1;
		const completedAt = (modelStateObj?.completedAt as number) ?? null;

		// ── Mode ───────────────────────────────────────────────────────
		const modeInfo = req.modeInfo as Record<string, unknown> | undefined;

		// ── Prompt token breakdown percentages (flattened from promptTokenDetails) ──
		const promptTokenDetails = req.promptTokenDetails as Array<Record<string, unknown>> | undefined;
		let systemInstructionsPct = 0, toolDefinitionsPct = 0, messagesPct = 0, filesPct = 0, toolResultsPct = 0;
		if (promptTokenDetails) {
			for (const detail of promptTokenDetails) {
				const cat = (detail.category as string) ?? '';
				const pct = (detail.percentageOfPrompt as number) ?? 0;
				switch (cat) {
					case 'System Instructions': systemInstructionsPct = pct; break;
					case 'Tool Definitions': toolDefinitionsPct = pct; break;
					case 'Messages': messagesPct = pct; break;
					case 'Files': filesPct = pct; break;
					case 'Tool Results': toolResultsPct = pct; break;
				}
			}
		}

		turnRows.push({
			request_id: requestId,
			session_id: sessionRow.session_id,
			timestamp: (req.timestamp as number) ?? 0,
			completed_at: completedAt,
			elapsed_ms: (req.elapsedMs as number) ?? null,
			first_progress_ms: firstProgressMs,
			total_elapsed_ms: totalElapsedMs,
			time_spent_waiting: (req.timeSpentWaiting as number) ?? null,
			model_id: reqModelId,
			vendor: reqVendor,
			model_name: sessionModelName ?? null,
			resolved_model: resolvedModel,
			agent_id: agentId,
			agent_extension: agentExtension,
			agent_name: agentName,
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			output_buffer: (req.outputBuffer as number) ?? null,
			copilot_credits: (req.copilotCredits as number) ?? null,
			system_instructions_pct: systemInstructionsPct,
			tool_definitions_pct: toolDefinitionsPct,
			messages_pct: messagesPct,
			files_pct: filesPct,
			tool_results_pct: toolResultsPct,
			model_state: modelState,
			vote: (req.vote as number) ?? null,
			user_message_length: messageText.length || null,
			user_message_parts: messageParts?.length ?? 1,
			mode_kind: (modeInfo?.kind as string) ?? null,
			is_system_initiated: req.isSystemInitiated ? 1 : 0,
			response_part_count: counts.responsePartCount,
			content_ref_count: counts.contentRefCount,
			code_citation_count: counts.codeCitationCount,
			edited_file_count: counts.editedFileCount,
			followup_count: counts.followupCount,
			variable_count: counts.variableCount,
			tool_call_rounds: tcr.rounds,
			tool_call_count: tcr.calls,
			thinking_tokens: tcr.thinkingTokens,
			estimated_cost_usd: null,
		});
	}

	if (turnRows.length === 0) { return null; }

	return {
		sessionRow,
		turnRows,
		filePath,
		fileSize: stat.size,
		fileMtime: stat.mtimeMs,
		fileHash: computeFileHash(content),
	};
}

/**
 * Batch parses multiple files, returning all successful results.
 * Failed files are silently skipped.
 */
export function parseSessionFiles(filePaths: string[], log?: ILogService): ParsedSession[] {
	const results: ParsedSession[] = [];
	for (const fp of filePaths) {
		try {
			const parsed = parseSessionFile(fp);
			if (parsed) { results.push(parsed); }
		} catch (err) {
			if (log) {
				log.warn(`Failed to parse ${path.basename(fp)}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}
	return results;
}
