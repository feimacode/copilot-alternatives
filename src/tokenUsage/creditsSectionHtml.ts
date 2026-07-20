/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CopilotCreditsSummary } from './metricsDatabase';
import { formatCredits } from './copilotCreditEstimator';

/** Rolling-window Copilot credit totals used for tooltip/dashboard breakdowns. */
export interface CopilotCreditWindows {
	day: CopilotCreditsSummary;
	week: CopilotCreditsSummary;
	month: CopilotCreditsSummary;
}

/** Minimal shape needed to render a per-model credits row. */
export interface CreditModelRow {
	modelId: string;
	credits: number;
	requestCount: number;
}

/**
 * Renders a "full credit view" fragment: rolling 24h/7d/30d credit totals plus a
 * per-model breakdown table, scoped to whatever the caller already filtered by
 * (vendor, model, date range, etc). Meant to be appended inside an existing
 * Monthly Credit Quota `.sec` block — relies on the `.tbl`/`.det` classes shared
 * by all token-usage dashboard webviews.
 */
export function renderCreditsBreakdownHtml(windows: CopilotCreditWindows, byModel: CreditModelRow[]): string {
	const rows = byModel.filter(m => m.credits > 0).sort((a, b) => b.credits - a.credits);
	return /* html */`
		<table class="tbl" style="margin-top:10px">
			<thead><tr><th>Window</th><th>Credits</th><th>Requests</th></tr></thead>
			<tbody>
				<tr><td>Last 24 hours</td><td>${formatCredits(windows.day.totalCredits)}</td><td>${windows.day.requestCount}</td></tr>
				<tr><td>Last 7 days</td><td>${formatCredits(windows.week.totalCredits)}</td><td>${windows.week.requestCount}</td></tr>
				<tr><td>Last 30 days</td><td>${formatCredits(windows.month.totalCredits)}</td><td>${windows.month.requestCount}</td></tr>
			</tbody>
		</table>
		${rows.length > 0 ? `
		<table class="tbl" style="margin-top:10px">
			<thead><tr><th>Model</th><th>Credits</th><th>Requests</th></tr></thead>
			<tbody>
				${rows.map(m => `<tr><td>${m.modelId}</td><td>${formatCredits(m.credits)}</td><td>${m.requestCount}</td></tr>`).join('')}
			</tbody>
		</table>` : ''}`;
}
