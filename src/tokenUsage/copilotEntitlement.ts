/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../platform/log/common/logService';

/**
 * GitHub Copilot plan entitlement, as best-effort resolved via a GitHub
 * authentication session + GitHub's internal (undocumented) Copilot token
 * endpoint. This is NOT a public/stable API — treat all resolved values as
 * estimates that may fail or drift over time. Callers must always handle
 * `undefined` gracefully (no entitlement known).
 */
export interface CopilotEntitlement {
	readonly planName: DetectedPlan;
	readonly monthlyCreditsIncluded: number;
	readonly billingCycleStartDay: number;
	readonly fetchedAt: number;
	readonly skuRaw: string;
}

export type DetectedPlan = 'free' | 'pro' | 'pro_plus' | 'max' | 'business' | 'enterprise';

/**
 * Estimated monthly AI-credit entitlement per plan. Reverse-engineered from
 * publicly observed Copilot billing behavior — not an authoritative source.
 * Pooled/monthly, resets on `billingCycleStartDay` of each month.
 */
const DEFAULT_PLAN_CREDITS: Record<DetectedPlan, number> = {
	free: 250,
	pro: 1500,
	pro_plus: 7000,
	max: 20000,
	business: 1900,
	enterprise: 3900,
};

const DEFAULT_BILLING_CYCLE_START_DAY = 1;

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';

/** Scope candidates tried in order — reuses any session cached by Copilot Chat/CLI sign-in. */
const SCOPE_CANDIDATES: string[][] = [
	['read:user'],
	['user:email'],
	['repo', 'workflow', 'read:user'],
	['repo'],
];

const ENTITLEMENT_CACHE_KEY = 'copilotAlternatives.entitlement.cache.v1';
const ENTITLEMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Attempts to reuse an existing GitHub session silently (no popup). Returns undefined if none cached. */
export async function trySilentGitHubSession(log?: ILogService): Promise<vscode.AuthenticationSession | undefined> {
	for (const scopes of SCOPE_CANDIDATES) {
		try {
			const session = await vscode.authentication.getSession('github', scopes, { silent: true, createIfNone: false });
			if (session) { return session; }
		} catch (err) {
			log?.debug(`CopilotEntitlement: silent session attempt failed for scopes [${scopes.join(',')}]: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return undefined;
}

/** Prompts the user to sign in with GitHub interactively. Only call this from an explicit user action (command). */
export async function signInInteractive(log?: ILogService): Promise<vscode.AuthenticationSession | undefined> {
	try {
		return await vscode.authentication.getSession('github', SCOPE_CANDIDATES[0], { createIfNone: true });
	} catch (err) {
		log?.warn(`CopilotEntitlement: interactive sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
		return undefined;
	}
}

/** Fetches the Copilot SKU string for the given GitHub access token, or null on any failure. */
export async function fetchCopilotSku(accessToken: string, log?: ILogService): Promise<string | null> {
	try {
		const res = await fetch(COPILOT_TOKEN_URL, {
			headers: { Authorization: `token ${accessToken}` },
		});
		if (!res.ok) {
			log?.debug(`CopilotEntitlement: token endpoint returned ${res.status}`);
			return null;
		}
		const body = await res.json() as { sku?: string };
		return body.sku ?? null;
	} catch (err) {
		log?.debug(`CopilotEntitlement: token endpoint fetch failed: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

/** Maps a raw Copilot SKU string (e.g. "copilot_pro_seat") to a known plan key. */
export function skuToPlan(sku: string): DetectedPlan | null {
	const s = sku.toLowerCase();
	if (s.includes('enterprise')) { return 'enterprise'; }
	if (s.includes('business')) { return 'business'; }
	if (s.includes('pro_plus') || s.includes('proplus')) { return 'pro_plus'; }
	if (s.includes('max')) { return 'max'; }
	if (s.includes('pro')) { return 'pro'; }
	if (s.includes('free')) { return 'free'; }
	return null;
}

interface CachedEntitlement extends CopilotEntitlement { }

function readCache(context: vscode.ExtensionContext): CachedEntitlement | undefined {
	return context.globalState.get<CachedEntitlement>(ENTITLEMENT_CACHE_KEY);
}

function writeCache(context: vscode.ExtensionContext, entitlement: CopilotEntitlement): void {
	void context.globalState.update(ENTITLEMENT_CACHE_KEY, entitlement);
}

/**
 * Resolves the user's Copilot plan entitlement. Checks a 24h globalState cache
 * first; on cache miss (or `forceRefresh`), attempts a GitHub session (silent
 * unless `interactive` is set) and fetches the Copilot SKU. Returns `undefined`
 * on any failure (no session, network error, unrecognized SKU) — callers must
 * treat this as "entitlement unknown", not an error.
 */
export async function resolveEntitlement(
	context: vscode.ExtensionContext,
	log: ILogService,
	options: { interactive: boolean; forceRefresh?: boolean } = { interactive: false },
): Promise<CopilotEntitlement | undefined> {
	if (!options.forceRefresh) {
		const cached = readCache(context);
		if (cached && (Date.now() - cached.fetchedAt) < ENTITLEMENT_CACHE_TTL_MS) {
			return cached;
		}
	}

	const session = options.interactive
		? await signInInteractive(log)
		: await trySilentGitHubSession(log);
	if (!session) {
		log.debug('CopilotEntitlement: no GitHub session available (silent lookup found none)');
		return undefined;
	}

	const sku = await fetchCopilotSku(session.accessToken, log);
	if (!sku) {
		log.debug('CopilotEntitlement: could not fetch Copilot SKU');
		return undefined;
	}

	const plan = skuToPlan(sku);
	if (!plan) {
		log.debug(`CopilotEntitlement: unrecognized SKU "${sku}"`);
		return undefined;
	}

	const entitlement: CopilotEntitlement = {
		planName: plan,
		monthlyCreditsIncluded: DEFAULT_PLAN_CREDITS[plan],
		billingCycleStartDay: DEFAULT_BILLING_CYCLE_START_DAY,
		fetchedAt: Date.now(),
		skuRaw: sku,
	};
	writeCache(context, entitlement);
	log.info(`CopilotEntitlement: resolved plan "${plan}" (${entitlement.monthlyCreditsIncluded} credits/mo)`);
	return entitlement;
}

/** Computes the epoch-ms start of the current billing cycle, given the plan's cycle start day. */
export function currentCycleStartMs(billingCycleStartDay: number = DEFAULT_BILLING_CYCLE_START_DAY): number {
	const now = new Date();
	let year = now.getFullYear();
	let month = now.getMonth();
	if (now.getDate() < billingCycleStartDay) {
		month -= 1;
		if (month < 0) { month = 11; year -= 1; }
	}
	return new Date(year, month, billingCycleStartDay).getTime();
}
