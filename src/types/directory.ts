/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * A single item (row) within a directory subgroup (table).
 * Maps to one row in a README table.
 */
export interface IDirectoryItem {
	/** Unique identifier within its subgroup (derived from name). */
	readonly id: string;
	/** Display name (e.g., "Cursor Pro", "Claude Opus 4.7"). */
	readonly name: string;
	/** Optional URL to the product/provider page. */
	readonly url?: string;
	/** Short description / tagline. */
	readonly description?: string;
	/** Price string (e.g., "$20/mo", "Free"). */
	readonly price?: string;
	/** Included quota / usage limit. */
	readonly quota?: string;
	/** Model names if applicable (e.g., for model→plan mappings). */
	readonly models?: readonly string[];
	/** Notable features / capabilities. */
	readonly features?: readonly string[];
	/** Generic key-value extras (e.g., { "Min Seats": "1" }). */
	readonly extras?: Record<string, string>;
	/** Category tags for filtering / grouping. */
	readonly tags?: readonly string[];
	/** Additional properties passthrough. */
	[key: string]: unknown;
}

/**
 * A subgroup within a directory group, corresponding to a ### section table.
 * For flat groups (single table), there is one subgroup matching the group name.
 */
export interface IDirectorySubgroup {
	/** Unique identifier within the parent group. */
	readonly id: string;
	/** Display name (e.g., "IDE-Native Coding Plans"). */
	readonly name: string;
	/** Optional description / context for this subgroup. */
	readonly description?: string;
	/** Table items (rows). */
	readonly items: readonly IDirectoryItem[];
	/** Additional properties passthrough. */
	[key: string]: unknown;
}

/**
 * A top-level chapter in the catalog, corresponding to a ## section.
 */
export interface IDirectoryGroup {
	/** Unique identifier for the group. */
	readonly id: string;
	/** Display name (e.g., "Coding Plans", "Model Providers"). */
	readonly name: string;
	/** VS Code codicon ID for the tree node (e.g., "symbol-constant", "server"). */
	readonly icon?: string;
	/** Subgroups within this chapter. */
	readonly subgroups: readonly IDirectorySubgroup[];
	/** Additional properties passthrough. */
	[key: string]: unknown;
}

/**
 * Top-level catalog structure loaded from data/directory.json.
 */
export interface IDirectoryCatalog {
	/** Schema version for cache-invalidation purposes. */
	readonly version: string;
	/** Top-level groups. */
	readonly groups: readonly IDirectoryGroup[];
	/** Additional properties passthrough. */
	[key: string]: unknown;
}
