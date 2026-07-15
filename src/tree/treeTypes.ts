/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IDirectoryGroup, IDirectorySubgroup, IDirectoryItem } from '../types/directory';
import { IChatLanguageModelEntry, IChatLanguageModelModel } from '../byok/types';

/**
 * Discriminating union of all possible tree node types.
 */
export type TreeNodeType =
	| 'catalogGroup'
	| 'catalogSubgroup'
	| 'catalogItem'
	| 'byokSection'
	| 'byokProvider'
	| 'byokModel'
	| 'usageSection'
	| 'usageVendor'
	| 'usageModel'
	| 'moreInfoSection'
	| 'extensionSection'
	| 'extensionItem';

/**
 * Wraps a data object + type metadata for the TreeDataProvider.
 * The TreeItem itself is built lazily in getTreeItem().
 */
export class TreeNode {
	constructor(
		/** Discriminating type for context menu scoping. */
		readonly type: TreeNodeType,
		/** Unique identifier within the tree (used for stable identity across refreshes). */
		readonly id: string,
		/** Human-readable label. */
		readonly label: string,
		/** Reference to the underlying data object. */
		readonly data: IDirectoryGroup | IDirectorySubgroup | IDirectoryItem | IChatLanguageModelEntry | IChatLanguageModelModel | undefined,
		/** Optional description (shown dimmed next to the label). */
		readonly description?: string,
		/** Optional tooltip text. */
		readonly tooltip?: string,
	) { }

	/** Build the VS Code TreeItem DOM representation. */
	toTreeItem(): vscode.TreeItem {
		const item = new vscode.TreeItem(this.label);

		item.id = this.id;
		item.description = this.description;
		item.tooltip = this.tooltip ?? this.label;
		item.contextValue = this.type;

		// Collapsibility and command based on type
		switch (this.type) {
			case 'catalogGroup':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon(
					(this.data as IDirectoryGroup)?.icon ?? 'symbol-constant'
				);
				break;

			case 'catalogSubgroup':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('folder');
				break;

			case 'catalogItem': {
				item.collapsibleState = vscode.TreeItemCollapsibleState.None;
				const catalogItem = this.data as IDirectoryItem;
				item.iconPath = new vscode.ThemeIcon(
					catalogItem.price?.toLowerCase().startsWith('free')
						? 'check'
						: 'link'
				);
				// Primary click: open URL
				if (catalogItem.url) {
					item.command = {
						command: 'copilotAlternatives.openUrl',
						title: 'Open URL',
						arguments: [catalogItem.url],
					};
				}
				break;
			}

			case 'byokSection':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
				item.iconPath = new vscode.ThemeIcon('key');
				// No description — title is self-explanatory
				item.description = undefined;
				break;

			case 'byokProvider':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('symbol-color');
				break;

			case 'byokModel':
				item.collapsibleState = vscode.TreeItemCollapsibleState.None;
				item.iconPath = new vscode.ThemeIcon('symbol-method');
				// Primary click: edit model
				item.command = {
					command: 'copilotAlternatives.byok.editModel',
					title: 'Edit Model',
					arguments: [this.data],
				};
				break;

			case 'extensionSection':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('extensions');
				break;

			case 'extensionItem': {
				item.collapsibleState = vscode.TreeItemCollapsibleState.None;
				const extItem = this.data as IDirectoryItem;
				item.iconPath = new vscode.ThemeIcon('extensions');
				// Primary click: open the extension's home page
				if (extItem.url) {
					item.command = {
						command: 'copilotAlternatives.openUrl',
						title: 'Open Home Page',
						arguments: [extItem.url],
					};
				}
				break;
			}

			case 'moreInfoSection':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('book');
				break;

			case 'usageSection':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('dashboard');
				// Dashboard button on the usage root node
				item.command = {
					command: 'copilotAlternatives.showTokenUsage',
					title: 'Show Token Usage Dashboard',
				};
				break;

			case 'usageVendor':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				item.iconPath = new vscode.ThemeIcon('flame');
				break;

			case 'usageModel':
				item.collapsibleState = vscode.TreeItemCollapsibleState.None;
				item.iconPath = new vscode.ThemeIcon('symbol-method');
				break;
		}

		return item;
	}
}
