/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TokenUsageTracker } from './tokenUsageTracker';
import { formatTokenCount, formatCost, formatCostCompact, estimateEnergy, estimateCO2Grams, formatEnergy, formatCO2, resolveModelPricingKey } from './tokenCostEstimator';

// ─── Vendor color palette ─────────────────────────────────────────────────────

const VENDOR_COLORS: Record<string, string> = {
	feima: '#ec4899',     // Pink
	copilot: '#34d399',    // Emerald
	openai: '#10b981',     // Green
	anthropic: '#c084fc',  // Purple
	google: '#4285f4',     // Google Blue
	deepseek: '#6366f1',   // Indigo
	zhipu: '#f59e0b',      // Amber
	unknown: '#94a3b8',    // Slate
};

function vendorColor(vendor: string): string {
	return VENDOR_COLORS[vendor] ?? VENDOR_COLORS['unknown'];
}

/** Derive vendor from a model ID for coloring the vendor+model chart. */
function vendorForModel(modelId: string): string {
	const slash = modelId.indexOf('/');
	if (slash > 0) { return modelId.substring(0, slash); }
	return resolveModelPricingKey(modelId);
}

// ─── Chart.js loading ────────────────────────────────────────────────────────

let _chartJs: string | null = null;

function chartJsSource(): string {
	if (_chartJs) { return _chartJs; }
	// __dirname = out/tokenUsage/ → .. = out/ → .. = project root
	const candidates = [
		path.join(__dirname, '..', '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'),
	];
	try { candidates.push(require.resolve('chart.js/dist/chart.umd.min.js')); } catch { /* optional */ }
	for (const p of candidates) {
		try { if (fs.existsSync(p)) { _chartJs = fs.readFileSync(p, 'utf8'); return _chartJs; } } catch { /* try next */ }
	}
	return '/* Chart.js not found */';
}

// ─── Dashboard Panel ─────────────────────────────────────────────────────────

export class TokenUsageDashboard {
	static readonly viewType = 'copilotAlternatives.tokenUsage';
	/** The currently open dashboard panel, if any. */
	static currentPanel: TokenUsageDashboard | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, private readonly _tracker: TokenUsageTracker) {
		this._panel = panel;
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	static createOrShow(tracker: TokenUsageTracker): TokenUsageDashboard {
		const col = vscode.window.activeTextEditor?.viewColumn;
		if (TokenUsageDashboard.currentPanel) {
			TokenUsageDashboard.currentPanel._panel.reveal(col);
			return TokenUsageDashboard.currentPanel;
		}
		const panel = vscode.window.createWebviewPanel(
			TokenUsageDashboard.viewType,
			'Token Usage',
			col ?? vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		TokenUsageDashboard.currentPanel = new TokenUsageDashboard(panel, tracker);
		return TokenUsageDashboard.currentPanel;
	}

	update(): void {
		this._panel.webview.html = this._render();
	}

	// ── HTML Generation ───────────────────────────────────────────────────

	private _render(): string {
		// Pull from SQLite DB (fast aggregation query)
		const s = this._tracker.metricsService.getDashboardSummary();

		// Build vendor aggregate map compatible with chart expectations
		const vendorAggs: Record<string, { promptTokens: number; completionTokens: number; costUsd: number; apiReportedEvents: number; contextWindowEvents: number }> = {};
		const vendorEntries = s.vendorBreakdown.map(v => {
			vendorAggs[v.vendor] = { promptTokens: v.promptTokens, completionTokens: v.completionTokens, costUsd: v.costUsd, apiReportedEvents: v.requestCount, contextWindowEvents: 0 };
			return [v.vendor, { promptTokens: v.promptTokens, completionTokens: v.completionTokens, costUsd: v.costUsd, apiReportedEvents: v.requestCount, contextWindowEvents: 0 }] as const;
		}).sort((a, b) => (b[1].promptTokens + b[1].completionTokens) - (a[1].promptTokens + a[1].completionTokens));

		const allVendors = vendorEntries.map(([v]) => v);

		// Model rollup from DB modelBreakdown
		const modelRollup: Record<string, { tokens: number; costUsd: number; vendor: string; source: string }> = {};
		for (const m of s.modelBreakdown) {
			modelRollup[m.modelId] = { tokens: m.promptTokens + m.completionTokens, costUsd: m.costUsd, vendor: resolveModelPricingKey(m.modelId), source: 'api-reported' };
		}
		const modelEntries = Object.entries(modelRollup).sort((a, b) => b[1].tokens - a[1].tokens);

		const dailyAvgCost = s.allTime.totalCostUsd / Math.max(1, s.allTime.daysTracked);
		const projectedYearly = dailyAvgCost * 365;
		const jensenTarget = 250000;
		const jensenPct = Math.min(100, (projectedYearly / jensenTarget) * 100);

		// Week data for charts
		const week = [...s.thisWeek];
		const month = [...s.thisMonth];

		// Diagnostic: log chart data shape
		const weekNonZero = week.filter(d => d.totalPromptTokens + d.totalCompletionTokens > 0);
		const monthNonZero = month.filter(d => d.totalPromptTokens + d.totalCompletionTokens > 0);
		console.log(`[TokenUsageDashboard] render: week.length=${week.length} nonZero=${weekNonZero.length} month.length=${month.length} nonZero=${monthNonZero.length}`);
		if (weekNonZero.length > 0) {
			console.log(`[TokenUsageDashboard] sample week day: ${JSON.stringify(weekNonZero[0])}`);
		}
		console.log(`[TokenUsageDashboard] vendorAggs keys=${Object.keys(vendorAggs).length} entries=${vendorEntries.length} totalTokens=${vendorEntries.reduce((s,[,a])=>s+a.promptTokens+a.completionTokens,0)}`);

		const chartData = JSON.stringify({
			allVendors,
			weekLabels: week.map(d => d.date.slice(5)),
			weekTokens: week.map(d => d.totalPromptTokens + d.totalCompletionTokens),
			weekPrompt: week.map(d => d.totalPromptTokens),
			weekCompletion: week.map(d => d.totalCompletionTokens),
			weekCosts: week.map(d => d.estimatedCostUsd),
			monthLabels: month.map(d => d.date.slice(5)),
			monthTokens: month.map(d => d.totalPromptTokens + d.totalCompletionTokens),
			monthPrompt: month.map(d => d.totalPromptTokens),
			monthCompletion: month.map(d => d.totalCompletionTokens),
			monthCosts: month.map(d => d.estimatedCostUsd),
			vendorNames: vendorEntries.map(([v]) => v),
			vendorTokens: vendorEntries.map(([, a]) => a.promptTokens + a.completionTokens),
			vendorCosts: vendorEntries.map(([, a]) => a.costUsd),
			vendorApiEvents: vendorEntries.map(([, a]) => a.apiReportedEvents),
			vendorCwEvents: vendorEntries.map(([, a]) => a.contextWindowEvents),
			vendorColors: vendorEntries.map(([v]) => vendorColor(v)),
			modelNames: modelEntries.map(([m]) => m),
			modelTokens: modelEntries.map(([, r]) => r.tokens),
			modelCosts: modelEntries.map(([, r]) => r.costUsd),
			modelVendors: modelEntries.map(([, r]) => r.vendor),
			modelColors: modelEntries.map(([m]) => vendorColor(resolveModelPricingKey(m))),
			// Vendor+Model combo bar chart
			vmLabels: s.modelBreakdown.map(m => m.modelId),
			vmTokens: s.modelBreakdown.map(m => m.promptTokens + m.completionTokens),
			vmCosts: s.modelBreakdown.map(m => m.costUsd),
			vmColors: s.modelBreakdown.map(m => vendorColor(vendorForModel(m.modelId))),
			vmVendors: s.modelBreakdown.map(m => vendorForModel(m.modelId)),
		});

		const today = s.today;
		const totalToday = today.totalPromptTokens + today.totalCompletionTokens;
		const allTime = s.allTime;

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Token Usage Dashboard</title>
<style>
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

/* Cards */
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
@media(max-width:800px){.grid5{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px}
.card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:4px}
.card .val{font-size:22px;font-weight:700}
.card .det{font-size:10px;color:var(--muted);margin-top:2px}

/* Section */
.sec{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:14px}
.sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.sec-t{font-size:14px;font-weight:600}

/* Toggle */
.tgl{display:flex;gap:2px;background:var(--bg);border-radius:5px;padding:2px;border:1px solid var(--border)}
.tgl button{padding:3px 10px;font-size:10px;font-weight:500;border:none;border-radius:3px;cursor:pointer;background:transparent;color:var(--muted);font-family:var(--font)}
.tgl button.on{background:var(--accent);color:#fff}

/* Charts */
.ch2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:700px){.ch2{grid-template-columns:1fr}}
.ch{position:relative;height:180px}
.ch canvas{width:100%!important;height:100%!important}

/* Vendor filter */
.flt{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.flt label{display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg)}
.flt label.chk{background:var(--accent);color:#fff;border-color:var(--accent)}
.flt input{display:none}

/* Table */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border)}
.tbl td{font-size:11px;padding:8px 10px;border-bottom:1px solid var(--border)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}

/* Jensen */
.jb{background:var(--bg);border-radius:8px;height:24px;overflow:hidden;margin-top:6px}
.jb-f{height:100%;background:linear-gradient(90deg,var(--accent),#fb923c);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;min-width:40px;transition:width .4s}
.jb-m{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px}

/* Badge */
.badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px}
.badge-r{background:rgba(16,185,129,.15);color:var(--green)}
.badge-c{background:rgba(234,179,8,.15);color:#eab308}
</style>
</head>
<body>

<h1>Token Usage</h1>
<p class="subtitle">Chat model token consumption & estimated cost — all providers · <a href="command:copilotAlternatives.reloadTokenUsage" style="color:var(--accent);text-decoration:none" title="Clear state and reload all data from disk">↻ Reload from Disk</a></p>

<div class="grid5">
  <div class="card"><div class="lbl">Today's Tokens</div><div class="val">${formatTokenCount(totalToday)}</div><div class="det">In ${formatTokenCount(today.totalPromptTokens)} / Out ${formatTokenCount(today.totalCompletionTokens)}</div></div>
  <div class="card"><div class="lbl">Today's Cost</div><div class="val">${formatCost(today.estimatedCostUsd)}</div><div class="det">${vendorEntries.length} vendors active</div></div>
  <div class="card"><div class="lbl">All-Time Tokens</div><div class="val">${formatTokenCount(allTime.totalPromptTokens + allTime.totalCompletionTokens)}</div><div class="det">Since ${allTime.firstTrackedDate}</div></div>
  <div class="card"><div class="lbl">All-Time Cost</div><div class="val">${formatCost(allTime.totalCostUsd)}</div><div class="det">Avg ${formatCostCompact(dailyAvgCost)}/day</div></div>
  <div class="card"><div class="lbl">Vendors Tracked</div><div class="val">${vendorEntries.length}</div><div class="det">${allTime.daysTracked} days of data</div></div>
</div>

<!-- Toggle + Charts -->
<div class="sec">
  <div class="sec-h">
    <div class="sec-t">Usage Over Time</div>
    <div class="tgl" id="tglRange">
      <button class="on" data-r="week">7 Days</button>
      <button data-r="month">30 Days</button>
    </div>
  </div>
  <div class="ch2">
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500">Tokens (Input / Output)</div><div class="ch"><canvas id="tokenChart"></canvas></div></div>
    <div><div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:500">Cost (USD)</div><div class="ch"><canvas id="costChart"></canvas></div></div>
  </div>
</div>

<!-- Vendor Filter -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Vendor Breakdown</div><span style="font-size:10px;color:var(--muted)">Filter by provider</span></div>
  <div class="flt" id="fltVendors">
    ${allVendors.map((v, i) => `<label class="chk" data-v="${v}">
      <input type="checkbox" checked><span class="dot" style="background:${vendorColor(v)}"></span>${v}
    </label>`).join('')}
  </div>
  <div class="ch2">
    <div><div class="ch"><canvas id="vendorDonut"></canvas></div></div>
    <div style="overflow-y:auto;max-height:200px">
      <table class="tbl" id="vendorTbl"><thead><tr><th>Vendor</th><th>Tokens</th><th>Cost</th><th>Source</th></tr></thead><tbody>
        ${vendorEntries.map(([v, a]) => `<tr data-v="${v}">
          <td><span class="dot" style="background:${vendorColor(v)}"></span>${v}</td>
          <td>${formatTokenCount(a.promptTokens + a.completionTokens)}</td>
          <td>${formatCost(a.costUsd)}</td>
          <td>${a.apiReportedEvents > 0 ? `<span class="badge badge-r">API</span>` : ''}${a.contextWindowEvents > 0 ? `<span class="badge badge-c">CW</span>` : ''}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>
  </div>
</div>

<!-- Per-Vendor Daily Chart -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Daily Cost by Vendor</div></div>
  <div style="height:200px"><canvas id="vendorStackChart"></canvas></div>
</div>

<!-- Vendor+Model Combo -->
<div class="sec">
  <div class="sec-h">
    <div class="sec-t">Usage by Vendor / Model</div>
    <span style="font-size:10px;color:var(--muted)">Tokens per model, colored by vendor</span>
  </div>
  <div style="height:220px"><canvas id="vmChart"></canvas></div>
</div>

<!-- Jensen -->
<div class="sec">
  <div class="sec-h"><div class="sec-t">Jensen Benchmark</div><span style="font-size:10px;color:var(--muted)">$${(jensenTarget/1000).toFixed(0)}K/year target</span></div>
  <div class="jb"><div class="jb-f" style="width:${jensenPct.toFixed(1)}%">${jensenPct.toFixed(1)}%</div></div>
  <div class="jb-m"><span>Projected yearly: ${formatCost(projectedYearly)}</span><span>Target: ${formatCost(jensenTarget)}</span></div>
</div>

<script>${chartJsSource()}</script>
<script>
const D = ${chartData};
console.log('[Dashboard] Data loaded:',{weekLabels:D.weekLabels.length,weekTokens:D.weekTokens,monthLabels:D.monthLabels.length,vendorNames:D.vendorNames.length});
setTimeout(function(){
requestAnimationFrame(function(){
try{
Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted').trim()||'#888';
Chart.defaults.borderColor = getComputedStyle(document.body).getPropertyValue('--border').trim()||'#404';
Chart.defaults.font.size = 10;

// ── Token Chart ──
const tCtx = document.getElementById('tokenChart').getContext('2d');
const tokenChart = new Chart(tCtx,{type:'bar',data:{labels:D.weekLabels,datasets:[
  {label:'Input',data:D.weekPrompt,backgroundColor:'rgba(59,130,246,.7)',borderRadius:3},
  {label:'Output',data:D.weekCompletion,backgroundColor:'rgba(249,115,22,.7)',borderRadius:3}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:10}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}});

// ── Cost Chart ──
const cCtx = document.getElementById('costChart').getContext('2d');
const costChart = new Chart(cCtx,{type:'line',data:{labels:D.weekLabels,datasets:[
  {label:'Cost',data:D.weekCosts,borderColor:'rgba(16,185,129,.9)',backgroundColor:'rgba(16,185,129,.1)',fill:true,tension:.3,pointRadius:3,borderWidth:2}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>'$'+v.toFixed(4)}}}}});

// ── Vendor Donut ──
const vCtx = document.getElementById('vendorDonut').getContext('2d');
const vendorDonut = new Chart(vCtx,{type:'doughnut',data:{labels:D.vendorNames,datasets:[
  {data:D.vendorTokens,backgroundColor:D.vendorColors,borderWidth:0,hoverOffset:4}
]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{display:false}}}});

// ── Vendor Stack Chart (daily by vendor) ──
const vsCtx = document.getElementById('vendorStackChart').getContext('2d');
// Rebuild per-vendor daily cost data — simplified: use week totals spread across days
const vendorStackChart = new Chart(vsCtx,{type:'bar',data:{labels:D.weekLabels,datasets:D.vendorNames.map((v,i)=>({
  label:v,data:D.weekCosts.map(c=>c*(D.vendorTokens[i]/D.vendorTokens.reduce((a,b)=>a+b,1)||1)),
  backgroundColor:D.vendorColors[i]+'cc',borderRadius:2
}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:8,padding:8}}},
scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:v=>'$'+v.toFixed(4)}}}}});

// ── Vendor+Model Combo Chart ──
const vmCtx = document.getElementById('vmChart').getContext('2d');
const vmChart = new Chart(vmCtx,{type:'bar',data:{labels:D.vmLabels,datasets:[
  {label:'Tokens',data:D.vmTokens,backgroundColor:D.vmColors.map(c=>c+'99'),borderColor:D.vmColors,borderWidth:1,borderRadius:3}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
tooltip:{callbacks:{label:ctx=>{
  const v = D.vmVendors[ctx.dataIndex];
  return v +': '+ ctx.dataset.label + ': ' + (ctx.raw>=1e6?(ctx.raw/1e6).toFixed(1)+'M':ctx.raw>=1e3?(ctx.raw/1e3).toFixed(0)+'K':ctx.raw);
}}}},
scales:{x:{grid:{display:false},ticks:{maxRotation:45,minRotation:45,font:{size:8}}},
y:{ticks:{callback:v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v}}}}});

// ── Range toggle ──
document.getElementById('tglRange').addEventListener('click',e=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  document.querySelectorAll('#tglRange button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const r = btn.dataset.r;
  const labels = r==='week'? D.weekLabels : D.monthLabels;
  const prompt = r==='week'? D.weekPrompt : D.monthPrompt;
  const completion = r==='week'? D.weekCompletion : D.monthCompletion;
  const costs = r==='week'? D.weekCosts : D.monthCosts;
  tokenChart.data.labels = labels;
  tokenChart.data.datasets[0].data = prompt;
  tokenChart.data.datasets[1].data = completion;
  tokenChart.update();
  costChart.data.labels = labels;
  costChart.data.datasets[0].data = costs;
  costChart.update();
});

// ── Vendor filter ──
document.getElementById('fltVendors').addEventListener('click',e=>{
  const lbl = e.target.closest('label');
  if(!lbl) return;
  lbl.classList.toggle('chk');
  const cb = lbl.querySelector('input');
  cb.checked = !cb.checked;
  _refreshVendorFilter();
});

function _getActiveVendors(){
  const active = [];
  document.querySelectorAll('#fltVendors label').forEach(l=>{
    if(l.querySelector('input').checked) active.push(l.dataset.v);
  });
  return active;
}

function _refreshVendorFilter(){
  const active = _getActiveVendors();
  // Show/hide table rows
  document.querySelectorAll('#vendorTbl tbody tr').forEach(tr=>{
    tr.style.display = active.includes(tr.dataset.v) ? '' : 'none';
  });
  // Update donut chart
  const idxs = [];
  const names = [];
  const tokens = [];
  const colors = [];
  D.vendorNames.forEach((v,i)=>{
    if(active.includes(v)){
      idxs.push(i);
      names.push(v);
      tokens.push(D.vendorTokens[i]);
      colors.push(D.vendorColors[i]);
    }
  });
  vendorDonut.data.labels = names;
  vendorDonut.data.datasets[0].data = tokens;
  vendorDonut.data.datasets[0].backgroundColor = colors;
  vendorDonut.update();
}
}catch(e){console.error('[Dashboard] Chart init error:',e);document.body.insertAdjacentHTML('beforeend','<div style="color:red;padding:10px">Chart error: '+e.message+'</div>');}
});
});
</script>
</body>
</html>`;
	}

	private dispose(): void {
		TokenUsageDashboard.currentPanel = undefined;
		this._panel.dispose();
		for (const d of this._disposables) { d.dispose(); }
	}
}
