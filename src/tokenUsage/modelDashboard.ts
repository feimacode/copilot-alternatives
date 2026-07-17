/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatTokenCount, formatCost, formatCostCompact } from './tokenCostEstimator';

// ─── Vendor color palette ─────────────────────────────────────────────────────

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
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
@media(max-width:800px){.grid4,.grid3{grid-template-columns:repeat(2,1fr)}}
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
.chart-wrap{position:relative;min-height:200px}
.chart-wrap canvas{width:100%!important;height:100%!important}
.ch2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:700px){.ch2{grid-template-columns:1fr}}
.tgl{display:flex;gap:2px;background:var(--bg);border-radius:5px;padding:2px;border:1px solid var(--border)}
.tgl button{padding:3px 10px;font-size:10px;font-weight:500;border:none;border-radius:3px;cursor:pointer;background:transparent;color:var(--muted);font-family:var(--font)}
.tgl button.on{background:var(--accent);color:#fff}
.flt{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.flt label{display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg)}
.flt label.chk{background:var(--accent);color:#fff;border-color:var(--accent)}
.flt input{display:none}
.empty{text-align:center;color:var(--muted);padding:40px 20px;font-size:13px}
.pie-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:14px}
@media(max-width:700px){.pie-grid{grid-template-columns:1fr}}
.pie-card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}
.pie-card .pie-label{font-size:10px;font-weight:600;color:var(--text);margin-bottom:8px}
.pie-card .pie-chart{position:relative;height:160px}

/* Date Range Picker */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.drp{display:flex;align-items:center;gap:6px}
.drp-date{padding:3px 8px;font-size:10px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--text);font-family:var(--font);display:none}
.drp-date:focus{border-color:var(--accent);outline:none}
`;

const PROMPT_CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

// ─── ModelDashboard ───────────────────────────────────────────────────────────

export class ModelDashboard {
	static readonly viewType = 'copilotAlternatives.modelUsage';
	static currentPanel: ModelDashboard | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];
	private _activeVendor: string | undefined;
	private _activeModel: string | undefined;
	private _days = 30;

	private constructor(panel: vscode.WebviewPanel, private readonly _tracker: TokenUsageTracker, vendor?: string, model?: string) {
		this._panel = panel;
		this._activeVendor = vendor;
		this._activeModel = model;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(msg => {
			if (msg.type === 'dateChange') {
				this._days = msg.days ?? 30;
				this.update();
			}
		}, null, this._disposables);
	}

	static createOrShow(tracker: TokenUsageTracker, vendor?: string, model?: string): ModelDashboard {
		const col = vscode.window.activeTextEditor?.viewColumn;
		if (ModelDashboard.currentPanel) {
			ModelDashboard.currentPanel._activeVendor = vendor ?? ModelDashboard.currentPanel._activeVendor;
			ModelDashboard.currentPanel._activeModel = model ?? ModelDashboard.currentPanel._activeModel;
			ModelDashboard.currentPanel._panel.reveal(col);
			return ModelDashboard.currentPanel;
		}
		const title = model ? `Token Usage — ${model}` : 'Token Usage — Models';
		const panel = vscode.window.createWebviewPanel(
			ModelDashboard.viewType,
			title,
			col ?? vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		ModelDashboard.currentPanel = new ModelDashboard(panel, tracker, vendor, model);
		return ModelDashboard.currentPanel;
	}

	update(): void {
		this._panel.webview.html = this._render();
	}

	private _render(): string {
		const vendor = this._activeVendor;
		const modelId = this._activeModel;
		const s = this._tracker.metricsService.getModelViewSummary(vendor, modelId, this._days);
		const models = s.models;
		const promptBreakdowns = s.promptBreakdowns;
		const dailyByModel = s.dailyByModel;

		// All vendors for filter chips (if no vendor is pre-selected)
		const allVendors = this._tracker.metricsService.getAllVendors();

		// If model is selected, compute totals for just that model
		let totalPromptTokens: number;
		let totalCompletionTokens: number;
		let totalTokens: number;
		let totalRequests: number;
		let totalCost: number;
		if (modelId) {
			const m = models.find(m => m.modelId === modelId);
			totalPromptTokens = m?.promptTokens ?? 0;
			totalCompletionTokens = m?.completionTokens ?? 0;
			totalTokens = totalPromptTokens + totalCompletionTokens;
			totalRequests = m?.requestCount ?? 0;
			totalCost = m?.costUsd ?? 0;
		} else {
			totalPromptTokens = models.reduce((s, m) => s + m.promptTokens, 0);
			totalCompletionTokens = models.reduce((s, m) => s + m.completionTokens, 0);
			totalTokens = totalPromptTokens + totalCompletionTokens;
			totalRequests = models.reduce((s, m) => s + m.requestCount, 0);
			totalCost = models.reduce((s, m) => s + m.costUsd, 0);
		}

		// Daily usage aggregation
		const dateSet = new Set<string>();
		for (const d of dailyByModel) { dateSet.add(d.date); }
		const allDates = [...dateSet].sort().slice(-30);
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
		const weekDates = allDates.slice(-7);
		const monthDates = allDates.slice(-30);

		// Model entries for table
		const modelEntries = models.map(m => ({
			modelId: m.modelId,
			vendor: m.modelId.includes('/') ? m.modelId.split('/')[0] : (vendor ?? 'copilot'),
			promptTokens: m.promptTokens,
			completionTokens: m.completionTokens,
			totalTokens: m.promptTokens + m.completionTokens,
			costUsd: m.costUsd,
			requestCount: m.requestCount,
			inPct: totalTokens > 0 ? m.promptTokens / totalTokens : 0,
			outPct: totalTokens > 0 ? m.completionTokens / totalTokens : 0,
		}));

		// If single model, model daily stacked chart shows model detail
		const modelDailyIds = [...new Set(dailyByModel.map(d => d.modelId))];
		const modelDailyMap: Record<string, Record<string, number>> = {};
		for (const mid of modelDailyIds) { modelDailyMap[mid] = {}; }
		for (const d of dailyByModel) {
			modelDailyMap[d.modelId] = modelDailyMap[d.modelId] ?? {};
			modelDailyMap[d.modelId][d.date] = d.totalTokens;
		}

		// Prompt breakdown pies — if single model, show the 5-category breakdown + I/O pie
		const topPies = promptBreakdowns.slice(0, 6);
		const hasPromptData = promptBreakdowns.some(p =>
			p.avgSystemInstructionsPct > 0 || p.avgToolDefinitionsPct > 0 ||
			p.avgMessagesPct > 0 || p.avgFilesPct > 0 || p.avgToolResultsPct > 0
		);

		const chartData = JSON.stringify({
			vendor: vendor ?? null,
			model: modelId ?? null,
			allVendors,
			activeVendor: vendor ?? null,
			modelEntries,
			weekDates: weekDates.map(d => d.slice(5)),
			monthDates: monthDates.map(d => d.slice(5)),
			weekTokens: weekDates.map(d => dailyTokensMap[d] || 0),
			monthTokens: monthDates.map(d => dailyTokensMap[d] || 0),
			weekPrompt: weekDates.map(d => dailyPromptMap[d] || 0),
			monthPrompt: monthDates.map(d => dailyPromptMap[d] || 0),
			weekCompletion: weekDates.map(d => dailyCompletionMap[d] || 0),
			monthCompletion: monthDates.map(d => dailyCompletionMap[d] || 0),
			weekRequests: weekDates.map(d => dailyRequestsMap[d] || 0),
			monthRequests: monthDates.map(d => dailyRequestsMap[d] || 0),
			monthDatesFull: monthDates,
			modelDailyIds,
			modelDailyStack: modelDailyIds.map(mid => monthDates.map(d => modelDailyMap[mid]?.[d] ?? 0)),
			modelDailyColors: modelDailyIds.map(mid => vendorColor(mid.includes('/') ? mid.split('/')[0] : (vendor ?? 'copilot'))),
			topPies: topPies.map(p => ({
				modelId: p.modelId,
				labels: ['System Instructions', 'Tool Definitions', 'Messages', 'Files', 'Tool Results'],
				values: [
					p.avgSystemInstructionsPct,
					p.avgToolDefinitionsPct,
					p.avgMessagesPct,
					p.avgFilesPct,
					p.avgToolResultsPct,
				],
			})),
			hasPromptData,
			totalTokens, totalPromptTokens, totalCompletionTokens,
			totalRequests, totalCost,
			modelCount: models.length,
		});

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${modelId ? modelId : 'Model Usage'}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="hdr">
  <div>
    <h1>${modelId ? `<span class="dot" style="background:${vendorColor(vendor ?? 'unknown')}"></span>${modelId}` : 'Model Usage'}</h1>
    <p class="subtitle">Token usage &amp; prompt breakdown${vendor ? ' — ' + vendor : ''} · Last 30 days</p>
  </div>
  <div class="drp">
    <div class="tgl" id="tglRange">
      <button data-r="week">7 Days</button>
      <button class="on" data-r="month">30 Days</button>
      <button data-r="since">Since…</button>
    </div>
    <input type="date" id="sinceDate" class="drp-date" min="${allDates.length > 0 ? allDates[0] : ''}" />
  </div>
</div>

<!-- Vendor filter chips (only when no vendor/model pre-selected) -->
${!vendor && !modelId ? `<div class="sec">
  <div class="sec-h"><div class="sec-t">Filter by Vendor</div></div>
  <div class="flt" id="fltVendors">
    <label class="chk" data-v=""><input type="radio" name="vf" checked>All</label>
    ${allVendors.map(v => `<label data-v="${v}"><input type="radio" name="vf"><span class="dot" style="background:${vendorColor(v)}"></span>${v}</label>`).join('')}
  </div>
</div>` : ''}

<!-- Summary Cards -->
<div class="grid4">
  <div class="card"><div class="lbl">Total Tokens</div><div class="val">${formatTokenCount(totalTokens)}</div><div class="det">${formatTokenCount(totalPromptTokens)} in / ${formatTokenCount(totalCompletionTokens)} out</div></div>
  <div class="card"><div class="lbl">Total Requests</div><div class="val">${totalRequests.toLocaleString()}</div><div class="det">${modelId ? `Model: ${modelId}` : `${models.length} model(s)`}</div></div>
  <div class="card"><div class="lbl">Models</div><div class="val">${models.length}</div><div class="det">Active in last 30 days</div></div>
  <div class="card"><div class="lbl">Total Cost</div><div class="val">${formatCost(totalCost)}</div><div class="det">Estimated from token pricing</div></div>
</div>

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

<!-- Model Table -->
${!modelId ? `<div class="sec">
  <div class="sec-h"><div class="sec-t">Model Breakdown</div><span style="font-size:10px;color:var(--muted)">Click column header to sort</span></div>
  <table class="tbl" id="modelTbl">
    <thead><tr>
      <th data-sort="modelId">Model</th><th data-sort="requestCount">Requests</th>
      <th data-sort="totalTokens" class="sorted">Total Tokens</th>
      <th data-sort="promptTokens">Input</th><th data-sort="completionTokens">Output</th>
      <th>I/O Ratio</th><th data-sort="costUsd">Cost</th>
    </tr></thead>
    <tbody id="modelTbody">${modelEntries.map(m => `<tr>
      <td><span class="dot" style="background:${vendorColor(m.vendor)}"></span>${m.modelId}</td>
      <td>${m.requestCount.toLocaleString()}</td>
      <td><strong>${formatTokenCount(m.totalTokens)}</strong></td>
      <td>${formatTokenCount(m.promptTokens)}</td><td>${formatTokenCount(m.completionTokens)}</td>
      <td><span class="bar-wrap"><span class="bar-io-track"><span class="bar-io-fill in" style="width:${Math.round(m.inPct * 100)}%"></span></span><span class="bar-io-track"><span class="bar-io-fill out" style="width:${Math.round(m.outPct * 100)}%"></span></span><span style="font-size:9px;color:var(--muted)">${Math.round(m.inPct * 100)}/${Math.round(m.outPct * 100)}</span></span></td>
      <td>${formatCostCompact(m.costUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>
  ${models.length === 0 ? '<div class="empty">No model data yet.</div>' : ''}
</div>` : ''}

<!-- Prompt Token Breakdown -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Prompt Token Breakdown</div>
    <span style="font-size:10px;color:var(--muted)">${hasPromptData ? 'System Instructions · Tool Defs · Messages · Files · Tool Results' : 'No prompt breakdown data'}</span></div>
  ${hasPromptData ? `<div class="pie-grid" id="pieGrid">
    ${topPies.map((p, i) => `<div class="pie-card">
      <div class="pie-label">${p.modelId}</div>
      <div class="pie-chart"><canvas id="pie-${i}"></canvas></div>
    </div>`).join('')}
  </div>` : '<div class="empty">No prompt breakdown data available for this selection.</div>'}
</div>

<!-- Daily Tokens by Model -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Daily Tokens by Model (30 days)</div></div>
  <div class="chart-wrap"><canvas id="modelDailyChart"></canvas></div>
</div>

<script>${chartJsSource()}</script>
<script>
const D = ${chartData};
var PROMPT_COLORS = ${JSON.stringify(PROMPT_CATEGORY_COLORS)};
var _modelEntries = D.modelEntries;
var _vscode = acquireVsCodeApi();

function _postDateChange(days) {
  _vscode.postMessage({ type: 'dateChange', days: days });
}

setTimeout(function(){
requestAnimationFrame(function(){
try{
Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted').trim()||'#888';
Chart.defaults.borderColor = getComputedStyle(document.body).getPropertyValue('--border').trim()||'#404';
Chart.defaults.font.size = 10;

// ── Token Chart ──
var tCtx = document.getElementById('tokenChart').getContext('2d');
var tokenChart = new Chart(tCtx,{type:'bar',data:{labels:D.weekDates,datasets:[
  {label:'Input',data:D.weekPrompt,backgroundColor:'rgba(59,130,246,.7)',borderRadius:3},
  {label:'Output',data:D.weekCompletion,backgroundColor:'rgba(249,115,22,.7)',borderRadius:3}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:10}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}}});

// ── Request Chart ──
var rCtx = document.getElementById('requestChart').getContext('2d');
var requestChart = new Chart(rCtx,{type:'line',data:{labels:D.weekDates,datasets:[
  {label:'Requests',data:D.weekRequests,borderColor:D.vendor?(D.allVendors.indexOf(D.vendor)>=0?getComputedStyle(document.body).getPropertyValue('--blue').trim():'#f97316'):'#f97316',backgroundColor:'rgba(249,115,22,.15)',fill:true,tension:.3,pointRadius:3,borderWidth:2}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
scales:{x:{grid:{display:false}},y:{ticks:{callback:function(v){return v>=1e3?(v/1e3).toFixed(1)+'K':v}}}}}});

// ── Model Daily Stacked Chart ──
var mdCtx = document.getElementById('modelDailyChart').getContext('2d');
new Chart(mdCtx,{type:'bar',data:{labels:D.monthDatesFull.map(function(d){return d.slice(5);}),datasets:D.modelDailyIds.map(function(mid,i){return {
  label:mid,data:D.modelDailyStack[i],backgroundColor:D.modelDailyColors[i]+'88',borderRadius:2
};})},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:8}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}}});

// ── Prompt Breakdown Pies ──
D.topPies.forEach(function(pie, i){
  var ctx = document.getElementById('pie-'+i);
  if(!ctx) return;
  ctx = ctx.getContext('2d');
  var hasNonZero = pie.values.some(function(v){return v>0;});
  if(!hasNonZero) return;
  new Chart(ctx,{type:'doughnut',data:{labels:pie.labels,datasets:[{data:pie.values,backgroundColor:PROMPT_COLORS,borderWidth:0}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'50%',plugins:{legend:{display:false}}}});
});

// ── Date Range Picker ──
var _dateInput = document.getElementById('sinceDate');
var tgl = document.getElementById('tglRange');
if(tgl){tgl.addEventListener('click',function(e){
  var btn = e.target.closest('button');
  if(!btn) return;
  tgl.querySelectorAll('button').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  var r = btn.dataset.r;
  if(r === 'week') {
    _dateInput.style.display = 'none';
    _postDateChange(7);
  } else if(r === 'month') {
    _dateInput.style.display = 'none';
    _postDateChange(30);
  } else if(r === 'since') {
    _dateInput.style.display = 'inline-block';
    _dateInput.focus();
    if(_dateInput.value) {
      var sinceMs = new Date(_dateInput.value).getTime();
      var days = Math.max(1, Math.ceil((Date.now() - sinceMs) / 86400000) + 1);
      _postDateChange(days);
    }
  }
});}
if(_dateInput){_dateInput.addEventListener('change',function(){
  if(this.value) {
    var sinceMs = new Date(this.value).getTime();
    var days = Math.max(1, Math.ceil((Date.now() - sinceMs) / 86400000) + 1);
    _postDateChange(days);
  }
});}

// ── Vendor Filter ──
var flt = document.getElementById('fltVendors');
if(flt){flt.addEventListener('click',function(e){
  var lbl = e.target.closest('label');
  if(!lbl) return;
  var v = lbl.dataset.v || '';
  var a = document.createElement('a');
  a.href = v ? 'command:copilotAlternatives.showModelUsageForVendor?' + encodeURIComponent(JSON.stringify([v])) : 'command:copilotAlternatives.showModelUsage';
  a.click();
});}

// ── Table Sorting ──
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
    return '<tr><td><span class="dot" style="background:'+(D.allVendors.includes(m.vendor)?getComputedStyle(document.body).getPropertyValue('--blue').trim():'#94a3b8')+'"></span>'+m.modelId+'</td><td>'+m.requestCount.toLocaleString()+'</td><td><strong>'+_fmt(m.totalTokens)+'</strong></td><td>'+_fmt(m.promptTokens)+'</td><td>'+_fmt(m.completionTokens)+'</td><td><span class="bar-wrap"><span class="bar-io-track"><span class="bar-io-fill in" style="width:'+Math.round(inPct)+'%"></span></span><span class="bar-io-track"><span class="bar-io-fill out" style="width:'+Math.round(outPct)+'%"></span></span><span style="font-size:9px;color:var(--muted)">'+Math.round(inPct)+'/'+Math.round(outPct)+'</span></span></td><td>'+_fmtC(m.costUsd)+'</td></tr>';
  }).join('');
}
function _fmt(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(n);}
function _fmtC(n){return '$'+n.toFixed(4);}
function updateSortHeaders(){document.querySelectorAll('#modelTbl th').forEach(function(th){th.classList.remove('sorted');if(th.dataset.sort===sortCol)th.classList.add('sorted');});}
document.querySelectorAll('#modelTbl th[data-sort]').forEach(function(th){th.addEventListener('click',function(){sortModelTable(th.dataset.sort);});});

}catch(e){console.error('[ModelDashboard] Chart init error:',e);document.body.insertAdjacentHTML('beforeend','<div style="color:red;padding:10px">Chart error: '+e.message+'</div>');}
});
});
</script>
</body>
</html>`;
	}

	private dispose(): void {
		ModelDashboard.currentPanel = undefined;
		this._panel.dispose();
		for (const d of this._disposables) { d.dispose(); }
	}
}
