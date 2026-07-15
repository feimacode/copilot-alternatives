/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Source of token data: whether reported by the API or only context-window.
 */
export const enum TokenSource {
	ApiReported = 'api-reported',
	ContextWindow = 'context-window',
}

/** A tracked usage event ready for persistence. */
export interface TrackedUsageEvent {
	readonly timestamp: number;
	readonly vendor: string;
	readonly modelId: string;
	readonly modelName: string;
	readonly isBYOK: boolean;
	readonly source: TokenSource;
	readonly promptTokens: number;
	readonly completionTokens: number;
	readonly cachedTokens: number;
	/** Actual API latency in milliseconds (from chat session store). 0 when not available. */
	readonly elapsedMs?: number;
}

/** Per-vendor aggregates within a day/month. */
export interface VendorAggregate {
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	apiReportedEvents: number;
	contextWindowEvents: number;
}

/** Per-model aggregates. */
export interface ModelAggregate {
	promptTokens: number;
	completionTokens: number;
	cachedTokens: number;
	costUsd: number;
	source: TokenSource;
}

/** Daily usage record keyed by "YYYY-MM-DD". */
export interface DailyUsage {
	readonly date: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCachedTokens: number;
	estimatedCostUsd: number;
	byVendor: Record<string, VendorAggregate>;
	byModel: Record<string, ModelAggregate>;
}

/** Monthly roll-up keyed by "YYYY-MM". */
export interface MonthlyUsage {
	readonly month: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCachedTokens: number;
	estimatedCostUsd: number;
	byVendor: Record<string, VendorAggregate>;
	byModel: Record<string, ModelAggregate>;
}

/** Full usage summary for dashboard / status bar. */
export interface UsageSummary {
	today: DailyUsage;
	thisWeek: DailyUsage[];
	thisMonth: DailyUsage[];
	allTime: {
		totalPromptTokens: number;
		totalCompletionTokens: number;
		totalCachedTokens: number;
		totalCostUsd: number;
		firstTrackedDate: string;
		daysTracked: number;
	};
	monthlyRollups: MonthlyUsage[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY_DAILY = 'tokenUsage.dailyData';
const STORAGE_KEY_MONTHLY = 'tokenUsage.monthlyData';
const MAX_DAILY_RECORDS = 365;

export class TokenUsageStorage {
	private readonly _dailyData = new Map<string, DailyUsage>();
	private readonly _monthlyData = new Map<string, MonthlyUsage>();

	constructor(private readonly _globalState: vscode.Memento) {
		this._load();
	}

	// ── Write ──────────────────────────────────────────────────────────────

	recordUsage(event: TrackedUsageEvent, costUsd: number): void {
		const dateKey = this._tsToDateKey(event.timestamp);
		const monthKey = dateKey.substring(0, 7);

		// Daily
		const day = this._getOrCreateDay(dateKey);
		day.totalPromptTokens += event.promptTokens;
		day.totalCompletionTokens += event.completionTokens;
		day.totalCachedTokens += event.cachedTokens;
		day.estimatedCostUsd += costUsd;
		this._incVendor(day.byVendor, event, costUsd);
		this._incModel(day.byModel, event, costUsd);
		this._dailyData.set(dateKey, day);

		// Monthly roll-up
		const month = this._getOrCreateMonth(monthKey);
		month.totalPromptTokens += event.promptTokens;
		month.totalCompletionTokens += event.completionTokens;
		month.totalCachedTokens += event.cachedTokens;
		month.estimatedCostUsd += costUsd;
		this._incVendor(month.byVendor, event, costUsd);
		this._incModel(month.byModel, event, costUsd);
		this._monthlyData.set(monthKey, month);

		this._save();
		this._prune();
	}

	// ── Read ───────────────────────────────────────────────────────────────

	getDailyUsage(dateKey: string): DailyUsage {
		return this._dailyData.get(dateKey) ?? this._emptyDay(dateKey);
	}

	getLastNDays(n: number): DailyUsage[] {
		const result: DailyUsage[] = [];
		// Anchor from the most recent date with data, not today.
		// When all data is historical (e.g. from March but today is July),
		// anchoring to today would show N empty days in the chart.
		const anchor = this._mostRecentDate() ?? this._todayKey();
		const anchorDate = new Date(anchor + 'T00:00:00');
		for (let i = 0; i < n; i++) {
			const date = new Date(anchorDate);
			date.setDate(date.getDate() - i);
			const key = date.toISOString().split('T')[0];
			result.push(this._dailyData.get(key) ?? this._emptyDay(key));
		}
		return result;
	}

	getSummary(): UsageSummary {
		const todayKey = this._todayKey();
		const today = this._dailyData.get(todayKey) ?? this._emptyDay(todayKey);
		const thisWeek = this.getLastNDays(7).reverse();
		const thisMonth = this.getLastNDays(30).reverse();

		let tpt = 0, tct = 0, tcached = 0, tcost = 0, firstDate = todayKey;
		for (const [, d] of this._dailyData) {
			tpt += d.totalPromptTokens;
			tct += d.totalCompletionTokens;
			tcached += d.totalCachedTokens;
			tcost += d.estimatedCostUsd;
			if (d.date < firstDate) { firstDate = d.date; }
		}

		const daysTracked = this._daysBetween(firstDate, todayKey);
		return {
			today, thisWeek, thisMonth,
			allTime: { totalPromptTokens: tpt, totalCompletionTokens: tct, totalCachedTokens: tcached, totalCostUsd: tcost, firstTrackedDate: firstDate, daysTracked: Math.max(1, daysTracked) },
			monthlyRollups: [...this._monthlyData.values()].sort((a, b) => a.month.localeCompare(b.month)),
		};
	}

	getVendorAggregates(days: number): Record<string, VendorAggregate> {
		const result: Record<string, VendorAggregate> = {};
		for (const day of this.getLastNDays(days)) {
			for (const [vendor, agg] of Object.entries(day.byVendor)) {
				if (!result[vendor]) { result[vendor] = this._emptyVendor(); }
				result[vendor].promptTokens += agg.promptTokens;
				result[vendor].completionTokens += agg.completionTokens;
				result[vendor].cachedTokens += agg.cachedTokens;
				result[vendor].costUsd += agg.costUsd;
				result[vendor].apiReportedEvents += agg.apiReportedEvents;
				result[vendor].contextWindowEvents += agg.contextWindowEvents;
			}
		}
		return result;
	}

	async resetAll(): Promise<void> {
		this._dailyData.clear();
		this._monthlyData.clear();
		await this._globalState.update(STORAGE_KEY_DAILY, undefined);
		await this._globalState.update(STORAGE_KEY_MONTHLY, undefined);
	}

	// ── Private ────────────────────────────────────────────────────────────

	private _todayKey(): string { return new Date().toISOString().split('T')[0]; }
	private _tsToDateKey(ts: number): string { return new Date(ts).toISOString().split('T')[0]; }

	private _load(): void {
		const stored = this._globalState.get<Record<string, DailyUsage>>(STORAGE_KEY_DAILY, {});
		for (const [k, v] of Object.entries(stored)) { this._dailyData.set(k, v); }
		const storedM = this._globalState.get<Record<string, MonthlyUsage>>(STORAGE_KEY_MONTHLY, {});
		for (const [k, v] of Object.entries(storedM)) { this._monthlyData.set(k, v); }
	}

	private _save(): void {
		const d: Record<string, DailyUsage> = {};
		for (const [k, v] of this._dailyData) { d[k] = v; }
		void this._globalState.update(STORAGE_KEY_DAILY, d);
		const m: Record<string, MonthlyUsage> = {};
		for (const [k, v] of this._monthlyData) { m[k] = v; }
		void this._globalState.update(STORAGE_KEY_MONTHLY, m);
	}

	private _getOrCreateDay(key: string): DailyUsage { return this._dailyData.get(key) ?? this._emptyDay(key); }
	private _getOrCreateMonth(key: string): MonthlyUsage { return this._monthlyData.get(key) ?? this._emptyMonth(key); }

	private _incVendor(target: Record<string, VendorAggregate>, event: TrackedUsageEvent, costUsd: number): void {
		if (!target[event.vendor]) { target[event.vendor] = this._emptyVendor(); }
		const a = target[event.vendor];
		a.promptTokens += event.promptTokens;
		a.completionTokens += event.completionTokens;
		a.cachedTokens += event.cachedTokens;
		a.costUsd += costUsd;
		if (event.source === TokenSource.ApiReported) { a.apiReportedEvents++; } else { a.contextWindowEvents++; }
	}

	private _incModel(target: Record<string, ModelAggregate>, event: TrackedUsageEvent, costUsd: number): void {
		if (!target[event.modelId]) { target[event.modelId] = this._emptyModel(event.source); }
		const a = target[event.modelId];
		a.promptTokens += event.promptTokens;
		a.completionTokens += event.completionTokens;
		a.cachedTokens += event.cachedTokens;
		a.costUsd += costUsd;
	}

	private _emptyDay(date: string): DailyUsage { return { date, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, estimatedCostUsd: 0, byVendor: {}, byModel: {} }; }
	private _emptyMonth(month: string): MonthlyUsage { return { month, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, estimatedCostUsd: 0, byVendor: {}, byModel: {} }; }
	private _emptyVendor(): VendorAggregate { return { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: 0, apiReportedEvents: 0, contextWindowEvents: 0 }; }
	private _emptyModel(source: TokenSource): ModelAggregate { return { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: 0, source }; }

	private _daysBetween(d1: string, d2: string): number {
		return Math.max(0, Math.ceil((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000));
	}

	private _prune(): void {
		if (this._dailyData.size <= MAX_DAILY_RECORDS) { return; }
		const sorted = [...this._dailyData.keys()].sort();
		for (const k of sorted.slice(0, sorted.length - MAX_DAILY_RECORDS)) {
			this._dailyData.delete(k);
		}
	}

	/**
	 * Returns the most recent date key ("YYYY-MM-DD") that has data,
	 * or null if storage is empty. Used as anchor for chart date ranges
	 * so historical data appears in the dashboard when there's no
	 * activity today.
	 */
	private _mostRecentDate(): string | null {
		if (this._dailyData.size === 0) { return null; }
		return [...this._dailyData.keys()].sort().reverse()[0];
	}
}
