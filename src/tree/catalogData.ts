/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { IDirectoryCatalog, IDirectoryGroup } from '../types/directory';

/**
 * Loads and validates the catalog data from `data/directory.json`.
 * Uses sync I/O at activation time — the file is small and local.
 */
let _cachedGroups: readonly IDirectoryGroup[] | undefined;

/**
 * Resolves the absolute path to data/directory.json.
 * Works both in development (src/.../tree/catalogData.ts) and in
 * the compiled out/ tree.
 */
function resolveDataPath(extensionPath?: string): string {
	if (extensionPath) {
		return path.join(extensionPath, 'data', 'directory.json');
	}
	// Fallback: relative to __dirname (out/tree/)
	return path.join(__dirname, '..', '..', 'data', 'directory.json');
}

/**
 * Returns the catalog groups, loading them from disk on first call.
 * Results are cached in-memory for the lifetime of the extension.
 */
export function getCatalogData(extensionPath?: string): readonly IDirectoryGroup[] {
	if (_cachedGroups) {
		return _cachedGroups;
	}

	const dataPath = resolveDataPath(extensionPath);
	let raw: string;
	try {
		raw = fs.readFileSync(dataPath, 'utf-8');
	} catch {
		console.warn(`[copilot-alternatives] Could not read ${dataPath} — catalog tree will be empty.`);
		_cachedGroups = [];
		return _cachedGroups;
	}

	let catalog: IDirectoryCatalog;
	try {
		catalog = JSON.parse(raw) as IDirectoryCatalog;
	} catch (err) {
		console.warn(`[copilot-alternatives] Invalid JSON in ${dataPath}:`, err);
		_cachedGroups = [];
		return _cachedGroups;
	}

	if (!catalog.groups || !Array.isArray(catalog.groups)) {
		console.warn(`[copilot-alternatives] Missing "groups" array in ${dataPath}`);
		_cachedGroups = [];
		return _cachedGroups;
	}

	_cachedGroups = catalog.groups;
	return _cachedGroups;
}

/**
 * Invalidates the in-memory cache. Useful if the data file changes
 * during the extension's lifetime (e.g., via an update).
 */
export function invalidateCatalogCache(): void {
	_cachedGroups = undefined;
}

/**
 * Finds a catalog item by its compound ID: "groupId/subgroupId/itemId".
 * Returns the item, its parent subgroup, and parent group, or undefined.
 */
export function findCatalogItem(
	compoundId: string
): { item: IDirectoryCatalog['groups'][number]['subgroups'][number]['items'][number]; subgroup: IDirectoryCatalog['groups'][number]['subgroups'][number]; group: IDirectoryCatalog['groups'][number] } | undefined {
	const parts = compoundId.split('/');
	if (parts.length !== 3) {
		return undefined;
	}
	const [groupId, subgroupId, itemId] = parts;
	const groups = _cachedGroups ?? getCatalogData();
	for (const group of groups) {
		if (group.id === groupId) {
			for (const subgroup of group.subgroups) {
				if (subgroup.id === subgroupId) {
					const item = subgroup.items.find(i => i.id === itemId);
					if (item) {
						return { item, subgroup, group };
					}
				}
			}
		}
	}
	return undefined;
}
