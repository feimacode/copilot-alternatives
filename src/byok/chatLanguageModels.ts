/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { IChatLanguageModelEntry } from './types';

/**
 * Finds the chatLanguageModels.json file in the VS Code user data directory.
 *
 * Handles three scenarios:
 * 1. Local VS Code — reads from the platform default user data dir
 * 2. WSL remote — converts Windows paths from argv to /mnt/c/... paths
 * 3. Explicit --user-data-dir in process.argv
 */
export function findChatLanguageModelsFile(): vscode.Uri | undefined {
	const userDataDir = getUserDataDir();
	if (!userDataDir) {
		return undefined;
	}
	return vscode.Uri.file(path.join(userDataDir, 'chatLanguageModels.json'));
}

/**
 * Detects if we're running inside WSL by checking /proc/version.
 */
function isWsl(): boolean {
	try {
		const version = fs.readFileSync('/proc/version', 'utf-8');
		return version.toLowerCase().includes('microsoft') || version.toLowerCase().includes('wsl');
	} catch {
		return false;
	}
}

/**
 * Converts a Windows path (e.g. C:\Users\foo\...) to a WSL path (/mnt/c/Users/foo/...).
 */
function windowsToWslPath(windowsPath: string): string {
	return windowsPath
		.replace(/\\/g, '/')
		.replace(/^([A-Za-z]):/, '/mnt/$1');
}

/**
 * Resolves the VS Code user data directory, handling WSL remote scenarios.
 */
function getUserDataDir(): string | undefined {
	// Strategy 1: --user-data-dir from process.argv
	// In WSL remote, this may be a Windows path that needs conversion
	for (let i = 0; i < process.argv.length; i++) {
		let argValue: string | undefined;
		if (process.argv[i] === '--user-data-dir' && i + 1 < process.argv.length) {
			argValue = process.argv[i + 1];
		} else if (process.argv[i].startsWith('--user-data-dir=')) {
			argValue = process.argv[i].substring('--user-data-dir='.length);
		}

		if (argValue) {
			// If we're in WSL and the path looks like a Windows path, convert it
			if (isWsl() && /^[A-Za-z]:[\\/]/.test(argValue)) {
				return path.join(windowsToWslPath(argValue), 'User');
			}
			return argValue;
		}
	}

	// Strategy 2: WSL — read from the Windows filesystem via /mnt/c
	if (isWsl()) {
		const wslUserDataDir = getWslUserDataDir();
		if (wslUserDataDir) {
			return wslUserDataDir;
		}
	}

	// Strategy 3: Platform defaults (local VS Code)
	const home = os.homedir();
	const platform = process.platform;

	const appName = detectAppName();
	if (!appName) {
		return undefined;
	}

	if (platform === 'linux') {
		return path.join(home, '.config', appName, 'User');
	} else if (platform === 'darwin') {
		return path.join(home, 'Library', 'Application Support', appName, 'User');
	} else if (platform === 'win32') {
		return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), appName, 'User');
	}

	return undefined;
}

/**
 * In WSL, locates the Windows-side VS Code user data directory.
 * Tries the WSL username as a hint for the Windows username, then
 * falls back to scanning /mnt/c/Users/.
 */
function getWslUserDataDir(): string | undefined {
	const appName = detectAppName() ?? 'Code';
	const wslUser = os.userInfo().username;

	// Try the WSL username first (often matches Windows username)
	const candidates = [
		`/mnt/c/Users/${wslUser}/AppData/Roaming/${appName}/User`,
	];

	// Also try common variations
	if (wslUser.toLowerCase() !== wslUser) {
		candidates.push(`/mnt/c/Users/${wslUser.toLowerCase()}/AppData/Roaming/${appName}/User`);
	}

	// Scan /mnt/c/Users/ for any directory containing the file
	try {
		const usersDir = '/mnt/c/Users';
		if (fs.existsSync(usersDir)) {
			const entries = fs.readdirSync(usersDir);
			for (const entry of entries) {
				const candidate = path.join(usersDir, entry, 'AppData', 'Roaming', appName, 'User');
				if (fs.existsSync(path.join(candidate, 'chatLanguageModels.json'))) {
					return candidate;
				}
			}
		}
	} catch {
		// /mnt/c may not be accessible
	}

	// Return the first candidate that exists as a directory
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function detectAppName(): string | undefined {
	// Detect from env or process
	const appName = process.env['VSCODE_PORTABLE']
		? undefined  // portable mode has different structure
		: process.env['VSCODE_QUALITY'] === 'insider'
			? 'Code - Insiders'
			: process.env['VSCODE_QUALITY'] === 'oss'
				? 'Code - OSS'
				: 'Code';

	return appName;
}

/**
 * Reads and parses chatLanguageModels.json.
 * Returns an empty array if the file doesn't exist.
 */
export async function readProviders(): Promise<IChatLanguageModelEntry[]> {
	const fileUri = findChatLanguageModelsFile();
	if (!fileUri) {
		return [];
	}

	try {
		const raw = await vscode.workspace.fs.readFile(fileUri);
		const text = Buffer.from(raw).toString('utf-8');
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) {
			return parsed as IChatLanguageModelEntry[];
		}
		return [];
	} catch {
		// File doesn't exist or is invalid JSON
		return [];
	}
}

/**
 * Writes the provider array back to chatLanguageModels.json.
 * Creates the file if it doesn't exist.
 */
export async function writeProviders(entries: IChatLanguageModelEntry[]): Promise<void> {
	const fileUri = findChatLanguageModelsFile();
	if (!fileUri) {
		throw new Error('Could not locate chatLanguageModels.json — VS Code user data directory not found.');
	}

	const content = JSON.stringify(entries, undefined, '\t');
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
}

/**
 * Checks if a provider group with the given name already exists.
 */
export function hasProviderNamed(entries: IChatLanguageModelEntry[], name: string): boolean {
	return entries.some(e => e.name === name);
}

/**
 * Returns a masked representation of an API key for display purposes.
 * Handles both plain keys and VS Code secret references.
 */
export function maskApiKey(apiKey: string | undefined): string {
	if (!apiKey) {
		return '(not set)';
	}
	if (apiKey.startsWith('${input:')) {
		return '(encrypted)';
	}
	// Our template placeholder — show it clearly so users know to replace it
	if (apiKey === 'YOUR_API_KEY_HERE') {
		return 'YOUR_API_KEY_HERE (replace with real key)';
	}
	// Plain text key — mask it
	if (apiKey.length <= 8) {
		return '●●●●●●●●';
	}
	return apiKey.substring(0, 4) + '●●●●' + apiKey.substring(apiKey.length - 4);
}

/**
 * Removes a provider group by name from the entries array and writes back.
 * Returns true if a provider was removed, false if not found.
 */
export async function removeProviderByName(name: string): Promise<boolean> {
	const entries = await readProviders();
	const filtered = entries.filter(e => e.name !== name);
	if (filtered.length === entries.length) {
		return false;
	}
	await writeProviders(filtered);
	return true;
}
