/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TokenUsageTracker } from './tokenUsageTracker';
import { SessionDetail, TurnRow } from './metricsDatabase';
import { formatTokenCount, formatCost, formatCostCompact, resolveModelPricingKey } from './tokenCostEstimator';
import { formatCredits } from './copilotCreditEstimator';

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatMs(ms: number | null): string {
	if (ms === null || ms === undefined) { return '—'; }
	if (ms < 1000) { return `${ms}ms`; }
	if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s`; }
	const m = Math.floor(ms / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	return `${m}m ${s}s`;
}

function formatDate(ts: number): string {
	return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

function formatTime(ts: number): string {
	return new Date(ts).toISOString().slice(11, 19);
}

// ─── Dashboard Panel ─────────────────────────────────────────────────────────

export class SessionDashboard {
	static readonly viewType = 'copilotAlternatives.sessionDetail';
	static currentPanel: SessionDashboard | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];
	private _sessionId: string;

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly _tracker: TokenUsageTracker,
		sessionId: string,
	) {
		this._sessionId = sessionId;
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(msg => {
			if (msg.type === 'reload') {
				vscode.commands.executeCommand('copilotAlternatives.reloadTokenUsage');
			}
		}, null, this._disposables);
	}

	static createOrShow(tracker: TokenUsageTracker, sessionId: string): SessionDashboard {
		const col = vscode.window.activeTextEditor?.viewColumn;
		if (SessionDashboard.currentPanel) {
			SessionDashboard.currentPanel._panel.reveal(col);
			SessionDashboard.currentPanel._sessionId = sessionId;
			return SessionDashboard.currentPanel;
		}
		const panel = vscode.window.createWebviewPanel(
			SessionDashboard.viewType,
			'Session Details',
			col ?? vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		SessionDashboard.currentPanel = new SessionDashboard(panel, tracker, sessionId);
		return SessionDashboard.currentPanel;
	}

	update(): void {
		void this._renderAsync().then(html => {
			this._panel.webview.html = html;
		}).catch(() => { /* ignore render errors */ });
	}

	// ─── HTML Generation ───────────────────────────────────────────────

	private async _renderAsync(): Promise<string> {
		const detail = await this._tracker.metricsService.getSessionDetail(this._sessionId);
		if (!detail) {
			return this._renderEmpty();
		}
		return this._renderDetail(detail);
	}

	private _renderEmpty(): string {
		return /* html */`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Session Not Found</title>
<style>${this._sharedCss()}</style></head>
<body><h1>Session Not Found</h1>
<p class="subtitle">Session <strong>${this._sessionId}</strong> could not be found in the database.</p>
</body></html>`;
	}

	private _renderDetail(detail: SessionDetail): string {
		const s = detail.session;
		const turns = detail.turns;
		const isCopilot = s.session_vendor === 'copilot';

		// ── Overview stats ──────────────────────────────────────────────
		const dateStr = s.creation_date ? formatDate(s.creation_date) : 'N/A';
		const vendorModel = [s.session_vendor, s.session_model_name].filter(Boolean).join(' / ') || 'Unknown';
		const totalPrompt = turns.reduce((sum, t) => sum + t.prompt_tokens, 0);
		const totalCompletion = turns.reduce((sum, t) => sum + t.completion_tokens, 0);
		const totalThinking = turns.reduce((sum, t) => sum + t.thinking_tokens, 0);
		const totalCost = turns.reduce((sum, t) => sum + (t.estimated_cost_usd ?? 0), 0);
		const totalCredits = turns.reduce((sum, t) => sum + (t.copilot_credits ?? 0), 0);
		const totalElapsed = turns.reduce((sum, t) => sum + (t.total_elapsed_ms ?? 0), 0);
		const totalToolCalls = turns.reduce((sum, t) => sum + t.tool_call_count, 0);
		const uniqueAgents = [...new Set(turns.map(t => t.agent_name).filter(Boolean))];
		const uniqueModes = [...new Set(turns.map(t => t.mode_kind).filter(Boolean))];
		const pendingLabel = s.has_pending_edits ? '⚠ Has pending edits' : '';

		// ── Turns table rows (JSON for script) ─────────────────────────
		const turnRows = turns.map((t, i) => ({
			idx: i + 1,
			time: formatTime(t.timestamp),
			model: t.resolved_model ? t.resolved_model.split('/').pop() : (t.model_name ?? t.model_id.split('/').pop()),
			vendor: t.vendor,
			modelId: t.model_id,
			mode: t.mode_kind ?? '—',
			agent: t.agent_name ?? '—',
			prompt: t.prompt_tokens,
			completion: t.completion_tokens,
			thinking: t.thinking_tokens,
			cost: t.estimated_cost_usd ?? 0,
			credits: t.copilot_credits ?? 0,
			toolRounds: t.tool_call_rounds,
			toolCalls: t.tool_call_count,
			files: t.edited_file_count,
			ttfb: t.first_progress_ms,
			elapsed: t.total_elapsed_ms,
			sysPct: t.system_instructions_pct,
			toolPct: t.tool_definitions_pct,
			msgPct: t.messages_pct,
			filePct: t.files_pct,
			toolResPct: t.tool_results_pct,
			vote: t.vote,
		}));

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Session Details — ${s.session_id.substring(0, 8)}</title>
<style>${this._sharedCss()}
/* Session-specific styles */
.cell-model{font-size:11px;white-space:nowrap}
.sort-asc::after{content:' ▲';font-size:8px}
.sort-desc::after{content:' ▼';font-size:8px}
.empty{text-align:center;padding:40px;color:var(--muted)}
.pbar{display:flex;gap:1px;width:70px;height:10px;border-radius:3px;overflow:hidden;background:var(--bg);vertical-align:middle}
.pbar span{display:inline-block;height:100%}
.pbar-s{background:rgba(139,92,246,.7)}
.pbar-t{background:rgba(59,130,246,.7)}
.pbar-m{background:rgba(16,185,129,.7)}
.pbar-f{background:rgba(249,115,22,.7)}
.pbar-r{background:rgba(239,68,68,.7)}
</style>
</head>
<body>

<div class="hdr">
  <div>
    <h1>Session Details</h1>
    <p class="subtitle">
      <strong>${s.session_id}</strong> · ${dateStr} · ${vendorModel}
      ${pendingLabel ? `· <span style="color:var(--accent)">${pendingLabel}</span>` : ''}
      · <a href="#" onclick="_vscode.postMessage({type:'reload'});return false" style="color:var(--accent);text-decoration:none" title="Refresh stats DB from local session files">↻ Refresh Stats DB</a>
    </p>
  </div>
</div>

<div class="grid5">
  <div class="card">
    <div class="lbl">Date</div>
    <div class="val" style="font-size:16px">${dateStr.split(' ')[0]}</div>
    <div class="det">${s.session_family ?? ''} ${s.session_extension ?? ''}</div>
  </div>
  <div class="card">
    <div class="lbl">Model</div>
    <div class="val" style="font-size:14px">${vendorModel}</div>
    <div class="det">${s.session_is_byok ? 'BYOK' : 'Built-in'}</div>
  </div>
  <div class="card">
    <div class="lbl">Turns</div>
    <div class="val">${turns.length}</div>
    <div class="det">${uniqueModes.length > 0 ? uniqueModes.join(', ') : ''}</div>
  </div>
  <div class="card">
    <div class="lbl">Tokens</div>
    <div class="val">${formatTokenCount(totalPrompt + totalCompletion)}</div>
    <div class="det">In ${formatTokenCount(totalPrompt)} / Out ${formatTokenCount(totalCompletion)}${totalThinking > 0 ? ` · Think ${formatTokenCount(totalThinking)}` : ''}</div>
  </div>
  <div class="card">
    <div class="lbl">${isCopilot ? 'Credits' : 'Estimate'}</div>
    <div class="val">${isCopilot ? formatCredits(totalCredits) : formatCost(totalCost)}</div>
    <div class="det">${formatMs(totalElapsed)} total</div>
  </div>
</div>

<div class="sec">
  <div class="sec-h">
    <div class="sec-t">Turns (${turns.length})</div>
    <span style="font-size:10px;color:var(--muted)">
      ${uniqueAgents.length > 0 ? `Agents: ${uniqueAgents.slice(0, 3).join(', ')}` : ''}
    </span>
  </div>
  ${turns.length === 0 ? `<div class="empty">No turns with token data in this session.</div>` : `
  <div style="overflow-x:auto">
  <table class="tbl" id="turnTable">
    <thead>
      <tr>
        <th data-sort="idx" class="sorted sort-asc">#</th>
        <th data-sort="time">Time</th>
        <th data-sort="model">Model</th>
        <th data-sort="mode">Mode</th>
        <th data-sort="agent">Agent</th>
        <th data-sort="prompt">In</th>
        <th data-sort="completion">Out</th>
        <th data-sort="thinking">Think</th>
        <th>Prompt %</th>
        <th data-sort="${isCopilot ? 'credits' : 'cost'}">${isCopilot ? 'Credits' : 'Estimate'}</th>
        <th data-sort="toolCalls">Tools</th>
        <th data-sort="files">Files</th>
        <th data-sort="ttfb">TTFB</th>
        <th data-sort="elapsed">Elapsed</th>
      </tr>
    </thead>
    <tbody id="turnBody"></tbody>
  </table>
  </div>`}
</div>

<script>
const turns = ${JSON.stringify(turnRows)};
const IS_COPILOT = ${isCopilot};

function formatToks(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(0)+'K';
  return String(n);
}

function formatElapsed(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms/1000).toFixed(1) + 's';
  var m = Math.floor(ms / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  return m + 'm ' + s + 's';
}

function formatCreditsJs(n) {
  if (n >= 1000) return (n/1000).toFixed(2) + 'K cr';
  return n.toFixed(2) + ' cr';
}

function _promptBar(t) {
  var segs = [
    {v:t.sysPct||0, c:'pbar-s', lbl:'System'},
    {v:t.toolPct||0, c:'pbar-t', lbl:'Tools'},
    {v:t.msgPct||0, c:'pbar-m', lbl:'Messages'},
    {v:t.filePct||0, c:'pbar-f', lbl:'Files'},
    {v:t.toolResPct||0, c:'pbar-r', lbl:'Results'}
  ].filter(function(s){return s.v>0});
  if (segs.length===0) return '—';
  var total = segs.reduce(function(s,x){return s+x.v},0);
  var html = '<span class="pbar" title="' + segs.map(function(s){return s.lbl+':'+s.v+'%'}).join(', ') + '">';
  for (var i=0; i<segs.length; i++) {
    var w = total>0 ? Math.max(2,(segs[i].v/total)*100) : 0;
    html += '<span class="' + segs[i].c + '" style="width:' + w + '%"></span>';
  }
  html += '</span>';
  return html;
}

function renderTable(data) {
  var html = '';
  for (var i = 0; i < data.length; i++) {
    var t = data[i];
    var vendorModel = (t.vendor ? t.vendor + ' / ' : '') + (t.model || t.modelId || '');
    html += '<tr>' +
      '<td>' + t.idx + '</td>' +
      '<td>' + t.time + '</td>' +
      '<td class="cell-model" title="' + (t.modelId || '') + '">' + vendorModel + '</td>' +
      '<td>' + t.mode + '</td>' +
      '<td>' + t.agent + '</td>' +
      '<td>' + formatToks(t.prompt) + '</td>' +
      '<td>' + formatToks(t.completion) + '</td>' +
      '<td>' + (t.thinking > 0 ? formatToks(t.thinking) : '—') + '</td>' +
      '<td>' + _promptBar(t) + '</td>' +
      '<td>' + (IS_COPILOT ? (t.credits > 0 ? formatCreditsJs(t.credits) : '—') : (t.cost > 0 ? '$' + t.cost.toFixed(4) : '—')) + '</td>' +
      '<td title="' + (t.toolCalls > 0 ? t.toolCalls + ' tool calls across ' + t.toolRounds + ' rounds' : 'No tool calls') + '">' + (t.toolCalls > 0 ? t.toolCalls + ' / ' + t.toolRounds + 'r' : '—') + '</td>' +
      '<td>' + (t.files > 0 ? t.files : '—') + '</td>' +
      '<td>' + formatElapsed(t.ttfb) + '</td>' +
      '<td>' + formatElapsed(t.elapsed) + '</td>' +
    '</tr>';
  }
  document.getElementById('turnBody').innerHTML = html;
}

// ── VS Code API ──
const _vscode = acquireVsCodeApi();

// Initial render
renderTable(turns);

// Sorting
var sortCol = 'idx';
var sortDir = 1; // 1 = asc, -1 = desc

document.getElementById('turnTable').querySelector('thead').addEventListener('click', function(e) {
  var th = e.target.closest('th');
  if (!th || !th.dataset.sort) return;
  var col = th.dataset.sort;

  // Remove sort classes
  this.querySelectorAll('th').forEach(function(h) { h.classList.remove('sorted','sort-asc','sort-desc'); });

  if (col === sortCol) {
    sortDir = -sortDir; // toggle direction
  } else {
    sortCol = col;
    sortDir = 1; // new column: ascending first
  }

  // Highlight sorted column
  th.classList.add('sorted');
  th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');

  // Sort
  var sorted = turns.slice().sort(function(a, b) {
    var av = a[col], bv = b[col];
    if (typeof av === 'string') { return av.localeCompare(String(bv)) * sortDir; }
    return (av - bv) * sortDir;
  });

  // Re-index
  for (var i = 0; i < sorted.length; i++) { sorted[i].idx = i + 1; }
  renderTable(sorted);
});
</script>
</body>
</html>`;
	}

	private _sharedCss(): string {
		return `
:root {
  --bg: var(--vscode-editor-background,#1e1e1e);
  --card: var(--vscode-editorWidget-background,#252526);
  --text: var(--vscode-editor-foreground,#ccc);
  --muted: var(--vscode-descriptionForeground,#888);
  --border: var(--vscode-widget-border,#404040);
  --accent: #f97316;
  --green: #10b981;
  --blue: #3b82f6;
  --purple: #8b5cf6;
  --red: #ef4444;
  --font: var(--vscode-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:var(--bg);color:var(--text);padding:20px 28px;line-height:1.5;overflow-x:hidden}
h1{font-size:20px;font-weight:700;margin-bottom:4px}
.subtitle{color:var(--muted);font-size:12px;margin-bottom:20px}

.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}

.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
@media(max-width:800px){.grid5{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px}
.card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:4px}
.card .val{font-size:22px;font-weight:700}
.card .det{font-size:10px;color:var(--muted);margin-top:2px}

.sec{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:14px}
.sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.sec-t{font-size:14px;font-weight:600}

.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);cursor:pointer;user-select:none}
.tbl th.sorted{color:var(--accent)}
.tbl td{font-size:11px;padding:6px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
.tbl tbody tr:hover{background:rgba(255,255,255,.03)}

.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}`;
	}

	private dispose(): void {
		SessionDashboard.currentPanel = undefined;
		this._panel.dispose();
		for (const d of this._disposables) { d.dispose(); }
	}
}
