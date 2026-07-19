/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatCostCompact, formatTokenCount } from './tokenCostEstimator';

export class TokenUsageStatusBar implements vscode.Disposable {
	private readonly _item: vscode.StatusBarItem;

	constructor(private readonly _tracker: TokenUsageTracker) {
		this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
		this._item.command = 'copilotAlternatives.showTokenUsage';
		this._update();
		this._item.show();
	}

	/** Call this whenever new data arrives. */
	update(): void { this._update(); }

	private _update(): void {
		const s = this._tracker.storage.getSummary();
		const todayTokens = s.today.totalPromptTokens + s.today.totalCompletionTokens;
		const todayCost = s.today.estimatedCostUsd;
		this._item.text = `$(flame) ${formatTokenCount(todayTokens)} ${formatCostCompact(todayCost)}`;
		this._item.tooltip = this._buildTooltip(s);
	}

	private _buildTooltip(s: ReturnType<typeof this._tracker.storage.getSummary>): string {
		// 24 hours = today
		const day24 = { tokens: s.today.totalPromptTokens + s.today.totalCompletionTokens, cost: s.today.estimatedCostUsd };
		// Last 7 days
		const week = s.thisWeek.reduce((a, d) => ({
			tokens: a.tokens + d.totalPromptTokens + d.totalCompletionTokens,
			cost: a.cost + d.estimatedCostUsd,
		}), { tokens: 0, cost: 0 });
		// Last 30 days
		const month = s.thisMonth.reduce((a, d) => ({
			tokens: a.tokens + d.totalPromptTokens + d.totalCompletionTokens,
			cost: a.cost + d.estimatedCostUsd,
		}), { tokens: 0, cost: 0 });

		return [
			'Token Usage',
			`in 24 hours: ${formatTokenCount(day24.tokens)}  ${formatCostCompact(day24.cost)}`,
			`in a week:   ${formatTokenCount(week.tokens)}  ${formatCostCompact(week.cost)}`,
			`in a month:  ${formatTokenCount(month.tokens)}  ${formatCostCompact(month.cost)}`,
			'',
			'Click to open dashboard',
		].join('\n');
	}

	dispose(): void { this._item.dispose(); }
}
