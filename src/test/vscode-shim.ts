/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal vscode mock for unit tests outside the VS Code host.
 */

export const workspace = {
	getConfiguration: () => ({
		get: () => undefined,
		has: () => false,
	}),
	fs: {
		readFile: async () => { throw new Error('Mock: file not found'); },
		writeFile: async () => { /* noop */ },
	},
	openTextDocument: async () => ({ /* mock doc */ }),
};

export const window = {
	showInformationMessage: async () => undefined,
	showWarningMessage: async () => undefined,
	showErrorMessage: async () => undefined,
	showInputBox: async () => undefined,
	showQuickPick: async () => undefined,
	showTextDocument: async () => undefined,
	createWebviewPanel: () => ({
		webview: { html: '' },
		dispose: () => {},
	}),
};

export const commands = {
	registerCommand: () => ({ dispose: () => {} }),
	executeCommand: async () => undefined,
};

export const Uri = {
	file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
	parse: (uri: string) => ({ fsPath: uri, scheme: 'file', path: uri }),
};

export class EventEmitter {
	fire() {}
	dispose() {}
	get event() { return () => ({ dispose: () => {} }); }
}

export enum ViewColumn {
	One = 1,
	Two = 2,
	Three = 3,
}
