/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatTokenCount, formatCost, formatCostCompact } from './tokenCostEstimator';
import { formatCredits } from './copilotCreditEstimator';
import { renderCreditsBreakdownHtml } from './creditsSectionHtml';

// ─── Color helpers ───────────────────────────────────────────────────────────

const VENDOR_COLORS: Record<string, string> = {
	feima: '#ec4899',
	copilot: '#34d399',
	openai: '#10b981',
	anthropic: '#c084fc',
	google: '#4285f4',
	deepseek: '#6366f1',
	zhipu: '#f59e0b',
	unknown: '#94a3b8',
};

function vendorColor(vendor: string): string {
	return VENDOR_COLORS[vendor] ?? VENDOR_COLORS['unknown'];
}

const MODEL_PALETTE = [
	'#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
	'#ec4899', '#06b6d4', '#6366f1', '#84cc16', '#f97316',
	'#14b8a6', '#d946ef', '#f43f5e', '#8c9eff', '#ffab40',
];

function modelColor(modelId: string, index: number): string {
	return MODEL_PALETTE[index % MODEL_PALETTE.length];
}

// ─── Chart.js loading ────────────────────────────────────────────────────────

let _chartJs: string | null = null;

function chartJsSource(): string {
	if (_chartJs) { return _chartJs; }
	const candidates = [
		path.join(__dirname, '..', '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'),
	];
	try { candidates.push(require.resolve('chart.js/dist/chart.umd.min.js')); } catch { /* optional */ }
	for (const p of candidates) {
		try { if (fs.existsSync(p)) { _chartJs = fs.readFileSync(p, 'utf8'); return _chartJs; } } catch { /* try next */ }
	}
	return '/* Chart.js not found */';
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const SHARED_CSS = `
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
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
@media(max-width:800px){.grid4{grid-template-columns:repeat(2,1fr)}}
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
.tbl td{font-size:11px;padding:8px 10px;border-bottom:1px solid var(--border)}
.tbl tbody tr:hover{background:rgba(255,255,255,.03)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.bar-wrap{display:flex;align-items:center;gap:6px}
.bar-io-track{display:inline-block;width:80px;height:8px;border-radius:4px;background:var(--bg);overflow:hidden;vertical-align:middle}
.bar-io-fill{display:inline-block;height:100%;border-radius:4px}
.bar-io-fill.in{background:var(--blue)}
.bar-io-fill.out{background:var(--accent)}
.jb{background:var(--bg);border-radius:8px;height:24px;overflow:hidden;margin-top:6px}
.jb-f{height:100%;background:linear-gradient(90deg,var(--accent),#fb923c);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;min-width:40px;transition:width .4s}
.jb-m{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px}
.chart-wrap{position:relative;min-height:200px}
.chart-wrap canvas{width:100%!important;height:100%!important}
.ch2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:700px){.ch2{grid-template-columns:1fr}}
.tgl{display:flex;gap:2px;background:var(--bg);border-radius:5px;padding:2px;border:1px solid var(--border)}
.tgl button{padding:3px 10px;font-size:10px;font-weight:500;border:none;border-radius:3px;cursor:pointer;background:transparent;color:var(--muted);font-family:var(--font)}
.tgl button.on{background:var(--accent);color:#fff}
.empty{text-align:center;color:var(--muted);padding:40px 20px;font-size:13px}

/* Date Range Picker */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.drp{display:flex;align-items:center;gap:6px}
.drp-date{padding:3px 8px;font-size:10px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--text);font-family:var(--font);display:none}
.drp-date:focus{border-color:var(--accent);outline:none}
`;

// ─── VendorDashboard ──────────────────────────────────────────────────────────

export class VendorDashboard {
	static readonly viewType = 'copilotAlternatives.vendorUsage';
	static currentPanel: VendorDashboard | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];
	private _activeVendor: string;
	private _days = 30;
	private _rangeMode: 'week' | 'month' | 'since' = 'month';
	private _sinceDate = '';

	private constructor(panel: vscode.WebviewPanel, private readonly _tracker: TokenUsageTracker, vendor: string) {
		this._panel = panel;
		this._activeVendor = vendor;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(msg => {
			if (msg.type === 'dateChange') {
				this._days = msg.days ?? 30;
				this._rangeMode = msg.mode ?? 'month';
				this._sinceDate = msg.sinceDate ?? '';
				this.update();
			}
		}, null, this._disposables);
	}

	static createOrShow(tracker: TokenUsageTracker, vendor: string): VendorDashboard {
		const col = vscode.window.activeTextEditor?.viewColumn;
		if (VendorDashboard.currentPanel) {
			VendorDashboard.currentPanel._activeVendor = vendor;
			VendorDashboard.currentPanel._panel.reveal(col);
			return VendorDashboard.currentPanel;
		}
		const panel = vscode.window.createWebviewPanel(
			VendorDashboard.viewType,
			`Token Usage — ${vendor}`,
			col ?? vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		VendorDashboard.currentPanel = new VendorDashboard(panel, tracker, vendor);
		return VendorDashboard.currentPanel;
	}

    async update(): Promise<void> {
        this._panel.webview.html = await this._render();
	}

    private async _render(): Promise<string> {
		const vendor = this._activeVendor;
		const color = vendorColor(vendor);
		const isCopilot = vendor === 'copilot';
        const s = await this._tracker.metricsService.getVendorViewSummary(vendor, this._days);
		const models = s.models;
		const dailyByModel = s.dailyByModel;

		const totalPromptTokens = models.reduce((sum, m) => sum + m.promptTokens, 0);
		const totalCompletionTokens = models.reduce((sum, m) => sum + m.completionTokens, 0);
		const totalTokens = totalPromptTokens + totalCompletionTokens;
		const totalRequests = models.reduce((sum, m) => sum + m.requestCount, 0);
		const totalCost = models.reduce((sum, m) => sum + m.costUsd, 0);
		const totalCredits = models.reduce((sum, m) => sum + m.credits, 0);

		let creditsProgressHtml = '';
		if (isCopilot) {
			const [creditsSummary, creditsWindows] = await Promise.all([
				this._tracker.metricsService.getCopilotCreditsSummary(),
				this._tracker.metricsService.getCopilotCreditsWindows(),
			]);
			const breakdownHtml = renderCreditsBreakdownHtml(creditsWindows, models);
			const entitlement = this._tracker.copilotEntitlement;
			if (entitlement) {
				const pct = entitlement.monthlyCreditsIncluded > 0
					? Math.min(100, Math.round((creditsSummary.totalCredits / entitlement.monthlyCreditsIncluded) * 100))
					: 0;
				creditsProgressHtml = `<div class="sec"><div class="sec-h"><div class="sec-t">Monthly Credit Quota (${entitlement.planName} plan)</div></div>
					<div class="jb"><div class="jb-f" style="width:${pct}%">${pct}%</div></div>
					<div class="jb-m"><span>Used this cycle: ${formatCredits(creditsSummary.totalCredits)}</span><span>Included: ${formatCredits(entitlement.monthlyCreditsIncluded)}</span></div>
					${breakdownHtml}
					</div>`;
			} else {
				creditsProgressHtml = `<div class="sec"><div class="sec-h"><div class="sec-t">Monthly Credit Quota</div></div>
					<div class="det">Plan unknown — run "Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan" to see your quota and usage %.</div>
					${breakdownHtml}
					</div>`;
			}
		}

		// Daily usage — build lookup maps from DB data
		const dailyTokensMap: Record<string, number> = {};
		const dailyPromptMap: Record<string, number> = {};
		const dailyCompletionMap: Record<string, number> = {};
		const dailyRequestsMap: Record<string, number> = {};
		for (const d of dailyByModel) {
			dailyTokensMap[d.date] = (dailyTokensMap[d.date] || 0) + d.totalTokens;
			dailyPromptMap[d.date] = (dailyPromptMap[d.date] || 0) + d.totalPromptTokens;
			dailyCompletionMap[d.date] = (dailyCompletionMap[d.date] || 0) + d.totalCompletionTokens;
			dailyRequestsMap[d.date] = (dailyRequestsMap[d.date] || 0) + d.requestCount;
		}
		// Generate full date range for the selected period
		const rangeDates: string[] = [];
		for (let i = this._days - 1; i >= 0; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			rangeDates.push(d.toISOString().split('T')[0]);
		}

		// Model entries
		const modelEntries = models.map(m => ({
			modelId: m.modelId,
			promptTokens: m.promptTokens,
			completionTokens: m.completionTokens,
			totalTokens: m.promptTokens + m.completionTokens,
			costUsd: m.costUsd,
			credits: m.credits,
			requestCount: m.requestCount,
			inPct: totalTokens > 0 ? m.promptTokens / totalTokens : 0,
			outPct: totalTokens > 0 ? m.completionTokens / totalTokens : 0,
		}));

		// Model daily stacked
		const modelIds = [...new Set(dailyByModel.map(d => d.modelId))];
		const modelDailyMap: Record<string, Record<string, number>> = {};
		for (const mid of modelIds) { modelDailyMap[mid] = {}; }
		for (const d of dailyByModel) {
			modelDailyMap[d.modelId] = modelDailyMap[d.modelId] ?? {};
			modelDailyMap[d.modelId][d.date] = d.totalTokens;
		}

		const chartData = JSON.stringify({
			vendor,
			vendorColor: color,
            firstTrackedDate: s.firstTrackedDate,
			modelEntries,
			weekDates: rangeDates.slice(-7).map(d => d.slice(5)),
			monthDates: rangeDates.map(d => d.slice(5)),
			weekTokens: rangeDates.slice(-7).map(d => dailyTokensMap[d] || 0),
			monthTokens: rangeDates.map(d => dailyTokensMap[d] || 0),
			weekPrompt: rangeDates.slice(-7).map(d => dailyPromptMap[d] || 0),
			monthPrompt: rangeDates.map(d => dailyPromptMap[d] || 0),
			weekCompletion: rangeDates.slice(-7).map(d => dailyCompletionMap[d] || 0),
			monthCompletion: rangeDates.map(d => dailyCompletionMap[d] || 0),
			weekRequests: rangeDates.slice(-7).map(d => dailyRequestsMap[d] || 0),
			monthRequests: rangeDates.map(d => dailyRequestsMap[d] || 0),
			monthDatesFull: rangeDates,
			modelIds,
			modelDailyStack: modelIds.map(mid => rangeDates.map(d => modelDailyMap[mid]?.[d] ?? 0)),
			modelColors: modelIds.map((mid, i) => modelColor(mid, i)),
			totalTokens, totalPromptTokens, totalCompletionTokens,
			totalRequests, totalCost, totalCredits, isCopilot,
			modelCount: models.length,
		});

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Vendor: ${vendor}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="hdr">
  <div>
    <h1><span class="dot" style="background:${color}"></span>${vendor}</h1>
    <p class="subtitle">Token usage &amp; model breakdown · Earliest data: <strong>${s.firstTrackedDate ?? 'N/A'}</strong></p>
  </div>
  <div class="drp">
    <div class="tgl" id="tglRange">
      <button data-r="week" ${this._rangeMode === 'week' ? 'class="on"' : ''}>7 Days</button>
      <button data-r="month" ${this._rangeMode === 'month' ? 'class="on"' : ''}>30 Days</button>
      <button data-r="since" ${this._rangeMode === 'since' ? 'class="on"' : ''}>Since…</button>
    </div>
    <input type="date" id="sinceDate" class="drp-date" value="${this._sinceDate}" style="${this._rangeMode === 'since' ? 'display:inline-block' : ''}" />
  </div>
</div>

<div class="grid4">
  <div class="card"><div class="lbl">Tokens</div><div class="val">${formatTokenCount(totalTokens)}</div><div class="det">${formatTokenCount(totalPromptTokens)} in / ${formatTokenCount(totalCompletionTokens)} out</div></div>
  <div class="card"><div class="lbl">Requests</div><div class="val">${totalRequests.toLocaleString()}</div><div class="det">Across ${models.length} model(s)</div></div>
  <div class="card"><div class="lbl">Models</div><div class="val">${models.length}</div><div class="det">Active in last ${this._days} days</div></div>
  ${isCopilot
				? `<div class="card"><div class="lbl">AI Credits (est.)</div><div class="val">${formatCredits(totalCredits)}</div><div class="det">Estimated GitHub Copilot credits</div></div>`
				: `<div class="card"><div class="lbl">Estimate</div><div class="val">${formatCost(totalCost)}</div><div class="det">Estimated from token pricing</div></div>`}
</div>

${creditsProgressHtml}

<!-- Usage Over Time -->
<div class="sec">
  <div class="sec-h">
    <div class="sec-t">Usage Over Time</div>
  </div>
  <div class="ch2">
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500">Tokens (Input / Output)</div><div class="chart-wrap"><canvas id="tokenChart"></canvas></div></div>
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500">Requests</div><div class="chart-wrap"><canvas id="requestChart"></canvas></div></div>
  </div>
</div>

<!-- Model Breakdown Table -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Model Breakdown</div><span style="font-size:10px;color:var(--muted)">Click column header to sort</span></div>
  <table class="tbl" id="modelTbl">
    <thead><tr>
      <th data-sort="modelId">Model</th><th data-sort="requestCount">Requests</th>
      <th data-sort="totalTokens" class="sorted">Total Tokens</th>
      <th data-sort="promptTokens">Input</th><th data-sort="completionTokens">Output</th>
      <th>I/O Ratio</th><th data-sort="${isCopilot ? 'credits' : 'costUsd'}">${isCopilot ? 'AI Credits' : 'Estimate'}</th>
    </tr></thead>
    <tbody id="modelTbody">${modelEntries.map(m => `<tr>
      <td>${m.modelId}</td><td>${m.requestCount.toLocaleString()}</td>
      <td><strong>${formatTokenCount(m.totalTokens)}</strong></td>
      <td>${formatTokenCount(m.promptTokens)}</td><td>${formatTokenCount(m.completionTokens)}</td>
      <td><span class="bar-wrap"><span class="bar-io-track"><span class="bar-io-fill in" style="width:${Math.round(m.inPct * 100)}%"></span></span><span class="bar-io-track"><span class="bar-io-fill out" style="width:${Math.round(m.outPct * 100)}%"></span></span><span style="font-size:9px;color:var(--muted)">${Math.round(m.inPct * 100)}/${Math.round(m.outPct * 100)}</span></span></td>
      <td>${isCopilot ? formatCredits(m.credits) : formatCostCompact(m.costUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>
  ${models.length === 0 ? '<div class="empty">No model data for this vendor yet.</div>' : ''}
</div>

<!-- Daily Tokens by Model -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Daily Tokens by Model</div></div>
  <div class="chart-wrap"><canvas id="modelDailyChart"></canvas></div>
</div>

<!-- I/O Grouped Bar by Model -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Input vs Output by Model</div></div>
  <div class="chart-wrap" style="height:${Math.max(200, modelEntries.length * 24)}px"><canvas id="ioChart"></canvas></div>
</div>

<script>${chartJsSource()}</script>
<script>
const D = ${chartData};
var _modelEntries = D.modelEntries;
const _vscode = acquireVsCodeApi();

function _postDateChange(days, mode, sinceDate) {
  _vscode.postMessage({ type: 'dateChange', days: days, mode: mode || 'month', sinceDate: sinceDate || '' });
}

setTimeout(function(){
requestAnimationFrame(function(){

// ── Initialize charts ──
try{
Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted').trim()||'#888';
Chart.defaults.borderColor = getComputedStyle(document.body).getPropertyValue('--border').trim()||'#404';
Chart.defaults.font.size = 10;

// ── Token Chart ──
if(document.getElementById('tokenChart')){
var tCtx = document.getElementById('tokenChart').getContext('2d');
var tokenChart = new Chart(tCtx,{type:'bar',data:{labels:D.monthDates,datasets:[
  {label:'Input',data:D.monthPrompt,backgroundColor:'rgba(59,130,246,.7)',borderRadius:3},
  {label:'Output',data:D.monthCompletion,backgroundColor:'rgba(249,115,22,.7)',borderRadius:3}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:10}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}}});
}

// ── Request Chart ──
if(document.getElementById('requestChart')){
var rCtx = document.getElementById('requestChart').getContext('2d');
var requestChart = new Chart(rCtx,{type:'line',data:{labels:D.monthDates,datasets:[
  {label:'Requests',data:D.monthRequests,borderColor:D.vendorColor,backgroundColor:D.vendorColor+'22',fill:true,tension:.3,pointRadius:3,borderWidth:2}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
scales:{x:{grid:{display:false}},y:{ticks:{callback:function(v){return v>=1e3?(v/1e3).toFixed(1)+'K':v}}}}}});
}

// ── Model Daily Stacked Chart ──
if(document.getElementById('modelDailyChart')){
var mdCtx = document.getElementById('modelDailyChart').getContext('2d');
new Chart(mdCtx,{type:'bar',data:{labels:D.monthDatesFull.map(function(d){return d.slice(5);}),datasets:D.modelIds.map(function(mid,i){return {
  label:mid,data:D.modelDailyStack[i],backgroundColor:D.modelColors[i]+'88',borderRadius:2
};})},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:8}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}}});
}

// ── I/O Grouped Bar Chart ──
if(document.getElementById('ioChart')){
var ioCtx = document.getElementById('ioChart').getContext('2d');
new Chart(ioCtx,{type:'bar',data:{labels:_modelEntries.map(function(m){return m.modelId;}),datasets:[
  {label:'Input',data:_modelEntries.map(function(m){return m.promptTokens;}),backgroundColor:'rgba(59,130,246,.7)',borderRadius:3},
  {label:'Output',data:_modelEntries.map(function(m){return m.completionTokens;}),backgroundColor:'rgba(249,115,22,.7)',borderRadius:3}
]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:8}}},
scales:{x:{stacked:true,ticks:{callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}}});
}

// ── Table Sorting ──
if(document.getElementById('modelTbl')){
var sortCol = 'totalTokens', sortAsc = false;
function sortModelTable(col){
  if(sortCol===col){sortAsc=!sortAsc;}else{sortCol=col;sortAsc=false;}
  var dir = sortAsc?1:-1;
  _modelEntries.sort(function(a,b){var av=a[col],bv=b[col];return typeof av==='string'?dir*av.localeCompare(bv):dir*(av-bv);});
  renderTable();updateSortHeaders();
}
function renderTable(){
  document.getElementById('modelTbody').innerHTML = _modelEntries.map(function(m){
    var inPct=(D.totalTokens>0?m.promptTokens/D.totalTokens:0)*100,outPct=(D.totalTokens>0?m.completionTokens/D.totalTokens:0)*100;
    return '<tr><td>'+m.modelId+'</td><td>'+m.requestCount.toLocaleString()+'</td><td><strong>'+_fmt(m.totalTokens)+'</strong></td><td>'+_fmt(m.promptTokens)+'</td><td>'+_fmt(m.completionTokens)+'</td><td><span class="bar-wrap"><span class="bar-io-track"><span class="bar-io-fill in" style="width:'+Math.round(inPct)+'%"></span></span><span class="bar-io-track"><span class="bar-io-fill out" style="width:'+Math.round(outPct)+'%"></span></span><span style="font-size:9px;color:var(--muted)">'+Math.round(inPct)+'/'+Math.round(outPct)+'</span></span></td><td>'+_fmtC(D.isCopilot ? m.credits : m.costUsd)+'</td></tr>';
  }).join('');
}
function _fmt(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(n);}
function _fmtC(n){return D.isCopilot ? _fmtCredits(n) : ('$'+n.toFixed(4));}
function _fmtCredits(n){return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n));}
function updateSortHeaders(){document.querySelectorAll('#modelTbl th').forEach(function(th){th.classList.remove('sorted');if(th.dataset.sort===sortCol)th.classList.add('sorted');});}
document.querySelectorAll('#modelTbl th[data-sort]').forEach(function(th){th.addEventListener('click',function(){sortModelTable(th.dataset.sort);});});
}
}catch(e){console.error('[VendorDashboard] Chart init error:',e);document.body.insertAdjacentHTML('beforeend','<div style="color:red;padding:10px">Chart error: '+e.message+'</div>');}

// ── Date Range Picker (always registered) ──
var _dateInput = document.getElementById('sinceDate');
if(document.getElementById('tglRange')){
document.getElementById('tglRange').addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if(!btn) return;
  document.querySelectorAll('#tglRange button').forEach(function(b) { b.classList.remove('on'); });
  btn.classList.add('on');
  var r = btn.dataset.r;
  if(r === 'week') {
    _dateInput.style.display = 'none';
    _postDateChange(7, 'week', '');
  } else if(r === 'month') {
    _dateInput.style.display = 'none';
    _postDateChange(30, 'month', '');
  } else if(r === 'since') {
    _dateInput.style.display = 'inline-block';
    _dateInput.focus();
    if(_dateInput.value) {
      var sinceMs = new Date(_dateInput.value).getTime();
      var days = Math.max(1, Math.ceil((Date.now() - sinceMs) / 86400000) + 1);
      _postDateChange(days, 'since', _dateInput.value);
    }
  }
});
}
if(_dateInput){_dateInput.addEventListener('change', function() {
  if(this.value) {
    var sinceMs = new Date(this.value).getTime();
    var days = Math.max(1, Math.ceil((Date.now() - sinceMs) / 86400000) + 1);
    _postDateChange(days, 'since', this.value);
  }
});}

});
});
</script>
</body>
</html>`;
	}

	private dispose(): void {
		VendorDashboard.currentPanel = undefined;
		this._panel.dispose();
		for (const d of this._disposables) { d.dispose(); }
	}
}
