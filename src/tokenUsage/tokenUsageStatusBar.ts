/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatCostCompact, formatTokenCount } from './tokenCostEstimator';

const DEFAULT_DAILY_WATERMARK = 5;
const DEFAULT_WEEKLY_WATERMARK = 25;

export class TokenUsageStatusBar implements vscode.Disposable {
	private readonly _item: vscode.StatusBarItem;
	private _dailyShown = false;
	private _weeklyShown = false;

	constructor(private readonly _tracker: TokenUsageTracker) {
		this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
		this._item.command = 'copilotAlternatives.showTokenUsage';
		this._item.tooltip = 'Token Usage — click for dashboard';
		this._update();
		this._item.show();
	}

	/** Call this whenever new data arrives. */
	update(): void { this._update(); this._checkWatermarks(); }

	private _update(): void {
		const fmt = vscode.workspace.getConfiguration('copilotAlternatives.tokenUsage').get<string>('statusBarFormat', 'tokens-and-cost');
		const tokens = formatTokenCount(this._tracker.sessionTokens);
		const cost = formatCostCompact(this._tracker.sessionCost);
		switch (fmt) {
			case 'tokens-only': this._item.text = `$(flame) ${tokens}`; break;
			case 'cost-only': this._item.text = `$(flame) ${cost}`; break;
			default: this._item.text = `$(flame) ${tokens} ${cost}`; break;
		}
		this._item.tooltip = this._buildTooltip();
	}

	private _buildTooltip(): string {
		const s = this._tracker.storage.getSummary();
		const daily = s.today.estimatedCostUsd;
		const weekly = s.thisWeek.reduce((a, d) => a + d.estimatedCostUsd, 0);
		const cfg = vscode.workspace.getConfiguration('copilotAlternatives.tokenUsage');
		return [
			'Token Usage',
			`Session: ${formatTokenCount(this._tracker.sessionTokens)} tokens, ${formatCostCompact(this._tracker.sessionCost)}`,
			`Today: ${formatCostCompact(daily)}`,
			`This week: ${formatCostCompact(weekly)}`,
			'',
			`Watermarks: $${cfg.get<number>('dailyWatermark', DEFAULT_DAILY_WATERMARK)}/day, $${cfg.get<number>('weeklyWatermark', DEFAULT_WEEKLY_WATERMARK)}/week`,
			'Click for dashboard',
		].join('\n');
	}

	private _checkWatermarks(): void {
		const s = this._tracker.storage.getSummary();
		const cfg = vscode.workspace.getConfiguration('copilotAlternatives.tokenUsage');
		const daily = s.today.estimatedCostUsd;
		const weekly = s.thisWeek.reduce((a, d) => a + d.estimatedCostUsd, 0);
		const dw = cfg.get<number>('dailyWatermark', DEFAULT_DAILY_WATERMARK);
		const ww = cfg.get<number>('weeklyWatermark', DEFAULT_WEEKLY_WATERMARK);

		if (!this._dailyShown && daily >= dw) {
			this._dailyShown = true;
			vscode.window.showInformationMessage(`Token usage today: ${formatCostCompact(daily)}. Daily watermark: $${dw}.`);
		}
		if (!this._weeklyShown && weekly >= ww) {
			this._weeklyShown = true;
			vscode.window.showInformationMessage(`Token usage this week: ${formatCostCompact(weekly)}. Weekly watermark: $${ww}.`);
		}
	}

	dispose(): void { this._item.dispose(); }
}
