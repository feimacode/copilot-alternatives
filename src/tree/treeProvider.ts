/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TreeNode, TreeNodeType } from './treeTypes';
import { getCatalogData } from './catalogData';
import { readProviders } from '../byok/chatLanguageModels';
import { IDirectoryGroup, IDirectorySubgroup, IDirectoryItem } from '../types/directory';
import { IChatLanguageModelEntry, IChatLanguageModelModel } from '../byok/types';
import { TokenUsageTracker } from '../tokenUsage/tokenUsageTracker';
import { formatTokenCount, resolveModelPricingKey } from '../tokenUsage/tokenCostEstimator';

/**
 * Single unified TreeDataProvider for the Copilot Alternatives sidebar.
 */
export class TreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> = this._onDidChangeTreeData.event;

	/** Cached root children — refreshed on each change event. */
	private _catalogGroups: readonly IDirectoryGroup[] = [];
	private _extensionPath: string;
	private _tokenTracker: TokenUsageTracker | undefined;

	constructor(extensionPath: string, tokenTracker?: TokenUsageTracker) {
		this._extensionPath = extensionPath;
		this._tokenTracker = tokenTracker;
		this._catalogGroups = getCatalogData(extensionPath);
	}

	/**
	 * Call this after a BYOK provider is added/removed to refresh the tree.
	 */
	refresh(): void {
		// Re-read catalog (in case data changed, though normally cached)
		this._catalogGroups = getCatalogData(this._extensionPath);
		this._onDidChangeTreeData.fire(undefined);
	}

	// ─── TreeDataProvider interface ─────────────────────────────────────────

	getTreeItem(element: TreeNode): vscode.TreeItem {
		return element.toTreeItem();
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (!element) {
			return this._getRootChildren();
		}

		switch (element.type) {
			case 'catalogGroup':
				return this._getSubgroups(element.data as IDirectoryGroup);
			case 'catalogSubgroup':
				return this._getItems(element.data as IDirectorySubgroup, element.id);
			case 'byokSection':
				return this._getByokProviders();
			case 'byokProvider':
				return this._getByokModels(element.data as IChatLanguageModelEntry);
			case 'usageSection':
				return this._getUsageVendors();
			case 'usageVendor':
				return this._getUsageModels(element.label);
			case 'extensionSection':
				return this._getExtensionItems();
			case 'moreInfoSection':
				return this._getMoreInfoChildren();
			default:
				return [];
		}
	}

	// ─── Root children ──────────────────────────────────────────────────────

	private _getRootChildren(): TreeNode[] {
		const nodes: TreeNode[] = [];

		// 1. BYOK section — most important, always first and expanded
		nodes.push(new TreeNode(
			'byokSection',
			'byok-section',
			'BYOK & Model Management',
			undefined,
		));

		// 2. Extensions & Plugins — second, installable VS Code extensions
		const extGroup = this._catalogGroups.find(g => g.id === 'extensions-plugins');
		const extCount = extGroup?.subgroups[0]?.items.length ?? 0;
		const vscodeExtCount = extGroup?.subgroups[0]?.items.filter(
			i => i.extras?.['vscodeExtensionId']
		).length ?? 0;
		nodes.push(new TreeNode(
			'extensionSection',
			'extension-section',
			'Extensions & Plugins',
			undefined,
			`${vscodeExtCount} installable, ${extCount} total`,
			'Browse and install VS Code extensions for AI coding',
		));

		// 3. Usage Stats (from SQLite DB, last 7 days)
		if (this._tokenTracker) {
			const vendors7d = this._tokenTracker.metricsService.getVendorBreakdown7d();
			const totalTokens = vendors7d.reduce((sum, v) => sum + v.promptTokens + v.completionTokens, 0);
			const totalReqs = vendors7d.reduce((sum, v) => sum + v.requestCount, 0);
			const totalCost = vendors7d.reduce((sum, v) => sum + v.costUsd, 0);
			nodes.push(new TreeNode(
				'usageSection',
				'usage-section',
				'Usage Stats',
				undefined,
				`${formatTokenCount(totalTokens)} tokens | ${totalReqs} requests | in 7 days`,
				`${formatTokenCount(totalTokens)} tokens, ${totalReqs} requests, $${totalCost.toFixed(2)} cost — last 7 days`,
			));
		}

		// 4. Everything else folded under "More Info"
		const totalItems = this._catalogGroups.reduce(
			(sum, g) => sum + g.subgroups.reduce((s, sg) => s + sg.items.length, 0), 0
		) - extCount;
		nodes.push(new TreeNode(
			'moreInfoSection',
			'more-info',
			'More Info',
			undefined,
			`${this._catalogGroups.length - 1} categories, ${totalItems} items`,
			'Browse all catalog sections: coding plans, tools, providers, and pricing',
		));

		return nodes;
	}

	// ─── Extension items ──────────────────────────────────────────────────

	private _getExtensionItems(): TreeNode[] {
		const extGroup = this._catalogGroups.find(g => g.id === 'extensions-plugins');
		if (!extGroup?.subgroups[0]) {
			return [];
		}
		return extGroup.subgroups[0].items.map(item => {
			const extId = item.extras?.['vscodeExtensionId'] as string | undefined;
			const editors = (item.extras?.['Editors'] as string) ?? '';
			return new TreeNode(
				'extensionItem',
				`ext:${item.id}`,
				item.name,
				item,
				extId ?? editors,
				item.features?.join(', '),
			);
		});
	}

	// ─── Catalog children ───────────────────────────────────────────────────

	private _groupToNode(group: IDirectoryGroup): TreeNode {
		const itemCount = group.subgroups.reduce((sum, sg) => sum + sg.items.length, 0);
		return new TreeNode(
			'catalogGroup',
			`group:${group.id}`,
			group.name,
			group,
			`${group.subgroups.length} sections, ${itemCount} items`,
		);
	}

	private _getMoreInfoChildren(): TreeNode[] {
		return this._catalogGroups
			.filter(g => g.id !== 'extensions-plugins')
			.map(g => this._groupToNode(g));
	}

	private _getSubgroups(group: IDirectoryGroup): TreeNode[] {
		return group.subgroups.map(sg => {
			return new TreeNode(
				'catalogSubgroup',
				`sub:${group.id}/${sg.id}`,
				sg.name,
				sg,
				`${sg.items.length} items`,
				sg.description,
			);
		});
	}

	private _getItems(subgroup: IDirectorySubgroup, parentId: string): TreeNode[] {
		return subgroup.items.map(item => {
			// Derive the compound parent ID from the parent node's id
			// parentId looks like "sub:groupX/subgroupY", we want "groupX/subgroupY"
			const prefix = parentId.replace(/^sub:/, '');
			const features = item.features?.join(', ');
			return new TreeNode(
				'catalogItem',
				`item:${prefix}/${item.id}`,
				item.name,
				item,
				item.price,
				item.description ?? features,
			);
		});
	}

	// ─── BYOK children ─────────────────────────────────────────────────────

	private async _getByokProviders(): Promise<TreeNode[]> {
		const entries = await readProviders();
		return entries.map(entry => {
			const models = entry.models || [];
			return new TreeNode(
				'byokProvider',
				`byok:${entry.name}`,
				entry.name,
				entry,
				`${models.length} model(s)`,
				`Vendor: ${entry.vendor} | API: ${entry.apiType || 'chat-completions'}`,
			);
		});
	}

	private _getByokModels(entry: IChatLanguageModelEntry): TreeNode[] {
		const models = entry.models || [];
		return models.map(model => {
			const caps: string[] = [];
			if (model.toolCalling) { caps.push('tools'); }
			if (model.vision) { caps.push('vision'); }
			if (model.thinking) { caps.push('thinking'); }
			const contextTotal = ((model.maxInputTokens || 0) + (model.maxOutputTokens || 0)).toLocaleString();
			return new TreeNode(
				'byokModel',
				`byok:${entry.name}/${model.id}`,
				model.name,
				model,
				caps.join(' ') || undefined,
				`ID: ${model.id} | Context: ${contextTotal} tokens | URL: ${model.url}`,
			);
		});
	}


	// ─── Usage Stats ──────────────────────────────────────────────────────

	private _getUsageVendors(): TreeNode[] {
		if (!this._tokenTracker) { return []; }
		const vendors = this._tokenTracker.metricsService.getVendorBreakdown7d();

		return vendors
			.sort((a, b) => (b.promptTokens + b.completionTokens) - (a.promptTokens + a.completionTokens))
			.map(v => new TreeNode(
				'usageVendor',
				'usage-vendor:' + v.vendor,
				v.vendor,
				undefined,
				`${formatTokenCount(v.promptTokens + v.completionTokens)} | ${v.requestCount} requests | in a week`,
				`${v.vendor}: ${formatTokenCount(v.promptTokens + v.completionTokens)} tokens, ${v.requestCount} requests, $${v.costUsd.toFixed(2)} cost — last 7 days`,
			));
	}

	private _getUsageModels(vendor: string): TreeNode[] {
		if (!this._tokenTracker) { return []; }
		const models = this._tokenTracker.metricsService.getModelBreakdown7d(vendor);
		return models
			.sort((a, b) => (b.promptTokens + b.completionTokens) - (a.promptTokens + a.completionTokens))
			.map(m => {
				const lastSlash = m.modelId.lastIndexOf('/');
				const shortLabel = lastSlash === -1 ? m.modelId : m.modelId.slice(lastSlash + 1);
				return new TreeNode(
					'usageModel',
					'usage-model:' + m.modelId,
					shortLabel,
					undefined,
					`${formatTokenCount(m.promptTokens + m.completionTokens)} | ${m.requestCount} requests | in a week`,
					`${m.modelId}: ${formatTokenCount(m.promptTokens + m.completionTokens)} tokens, ${m.requestCount} requests, $${m.costUsd.toFixed(2)} cost — last 7 days`,
				);
			});
	}
}
