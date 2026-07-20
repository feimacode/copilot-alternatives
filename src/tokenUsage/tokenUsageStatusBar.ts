/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatCostCompact, formatTokenCount } from './tokenCostEstimator';
import { formatCredits } from './copilotCreditEstimator';
import { DashboardSummary, CopilotCreditsSummary } from './metricsDatabase';
import { CopilotCreditWindows } from './creditsSectionHtml';

export class TokenUsageStatusBar implements vscode.Disposable {
	private readonly _item: vscode.StatusBarItem;
	private _refreshing = false;
	private _refreshPending = false;

	constructor(private readonly _tracker: TokenUsageTracker) {
		this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
		this._item.command = 'copilotAlternatives.showTokenUsage';
		this._item.text = '$(flame) …';
		this._item.show();
		void this._update();
	}

	/** Call this whenever new data arrives. */
	update(): void { void this._update(); }

	private async _update(): Promise<void> {
		if (this._refreshing) { this._refreshPending = true; return; }
		this._refreshing = true;
		try {
			const { copilotDetected, allCopilot } = this._tracker.vendorUsageFlags;
			const summary = await this._tracker.metricsService.getDashboardSummary();
			const todayTokens = summary.today.totalPromptTokens + summary.today.totalCompletionTokens;
			const todayCost = summary.today.estimatedCostUsd;

			let creditsSummary: CopilotCreditsSummary | undefined;
			let creditsWindows: CopilotCreditWindows | undefined;
			if (copilotDetected) {
				[creditsSummary, creditsWindows] = await Promise.all([
					this._tracker.metricsService.getCopilotCreditsSummary(),
					this._tracker.metricsService.getCopilotCreditsWindows(),
				]);
			}

			if (allCopilot) {
				// 100% Copilot usage — $ cost has no meaning; show tokens + credits instead.
				this._item.text = `$(flame) ${formatTokenCount(todayTokens)} · ${formatCredits(creditsSummary?.totalCredits ?? 0)} cr`;
			} else {
				this._item.text = `$(flame) ${formatTokenCount(todayTokens)} ${formatCostCompact(todayCost)}`;
			}

			this._item.tooltip = this._buildTooltip(summary, { copilotDetected, allCopilot }, creditsSummary, creditsWindows);
		} finally {
			this._refreshing = false;
			if (this._refreshPending) {
				this._refreshPending = false;
				void this._update();
			}
		}
	}

	private _buildTooltip(
		summary: DashboardSummary,
		flags: { copilotDetected: boolean; allCopilot: boolean },
		creditsSummary: CopilotCreditsSummary | undefined,
		creditsWindows: CopilotCreditWindows | undefined,
	): string {
		const day24 = { tokens: summary.today.totalPromptTokens + summary.today.totalCompletionTokens, cost: summary.today.estimatedCostUsd };
		const week = summary.thisWeek.reduce((a, d) => ({
			tokens: a.tokens + d.totalPromptTokens + d.totalCompletionTokens,
			cost: a.cost + d.estimatedCostUsd,
		}), { tokens: 0, cost: 0 });
		const month = summary.thisMonth.reduce((a, d) => ({
			tokens: a.tokens + d.totalPromptTokens + d.totalCompletionTokens,
			cost: a.cost + d.estimatedCostUsd,
		}), { tokens: 0, cost: 0 });

		const lines: string[] = ['Token Usage'];

		if (!flags.allCopilot) {
			lines.push(
				`in 24 hours: ${formatTokenCount(day24.tokens)}  ${formatCostCompact(day24.cost)}`,
				`in a week:   ${formatTokenCount(week.tokens)}  ${formatCostCompact(week.cost)}`,
				`in a month:  ${formatTokenCount(month.tokens)}  ${formatCostCompact(month.cost)}`,
			);
		}

		if (flags.copilotDetected) {
			lines.push('', 'GitHub Copilot credits');
			if (creditsWindows) {
				lines.push(
					`  in 24 hours: ${formatCredits(creditsWindows.day.totalCredits)} cr`,
					`  in a week:   ${formatCredits(creditsWindows.week.totalCredits)} cr`,
					`  in a month:  ${formatCredits(creditsWindows.month.totalCredits)} cr`,
				);
			}
			const entitlement = this._tracker.copilotEntitlement;
			const used = creditsSummary?.totalCredits ?? 0;
			if (entitlement) {
				const pct = entitlement.monthlyCreditsIncluded > 0
					? Math.round((used / entitlement.monthlyCreditsIncluded) * 100)
					: 0;
				lines.push(`  ${formatCredits(used)} / ${formatCredits(entitlement.monthlyCreditsIncluded)} credits used (${pct}%) — ${entitlement.planName} plan`);
			} else {
				lines.push(`  ${formatCredits(used)} credits used this cycle (plan unknown)`);
				lines.push('  Run "Sign in with GitHub to Detect Copilot Plan" for your quota');
			}
		}

		lines.push('', 'Click to open dashboard');
		return lines.join('\n');
	}

	dispose(): void { this._item.dispose(); }
}
