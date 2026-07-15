/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FeimaCode. All rights reserved.
 *  Licensed under the MIT License.
 *  Adapted from feima-copilot-ai-flow logging infrastructure.
 *--------------------------------------------------------------------------------------------*/

/**
 * Log levels matching VS Code's LogLevel enum.
 */
export enum LogLevel {
	Off = 0,
	Trace = 1,
	Debug = 2,
	Info = 3,
	Warning = 4,
	Error = 5,
}

/**
 * Interface for log targets (output channels, console, telemetry, etc.).
 */
export interface ILogTarget {
	logIt(level: LogLevel, message: string): void;
	show?(preserveFocus?: boolean): void;
}

/**
 * Logger interface matching VS Code's LogOutputChannel methods.
 */
export interface ILogger {
	trace(message: string): void;
	debug(message: string): void;
	info(message: string): void;
	warn(message: string): void;
	error(error: string | Error, message?: string): void;
	show(preserveFocus?: boolean): void;

	/**
	 * Creates a sub-logger with a topic prefix.
	 * All messages will be prefixed with [Topic].
	 */
	createSubLogger(topic: string | readonly string[]): ILogService;

	/**
	 * Returns a new logger with an extra output target.
	 * Can be chained to add multiple targets.
	 */
	withExtraTarget(target: ILogTarget): ILogService;
}

/**
 * Main log service interface.
 */
export interface ILogService extends ILogger {
	readonly _serviceBrand: undefined;
}

/**
 * Log service implementation.
 */
export class LogServiceImpl implements ILogService {
	declare _serviceBrand: undefined;

	private readonly _logger: LoggerImpl;

	constructor(logTargets: ILogTarget[]) {
		this._logger = new LoggerImpl(logTargets);
	}

	trace(message: string): void { this._logger.trace(message); }
	debug(message: string): void { this._logger.debug(message); }
	info(message: string): void { this._logger.info(message); }
	warn(message: string): void { this._logger.warn(message); }
	error(error: string | Error, message?: string): void { this._logger.error(error, message); }
	show(preserveFocus?: boolean): void { this._logger.show(preserveFocus); }
	createSubLogger(topic: string | readonly string[]): ILogService { return this._logger.createSubLogger(topic); }
	withExtraTarget(target: ILogTarget): ILogService { return this._logger.withExtraTarget(target); }
}

// ─── Internal implementation ─────────────────────────────────────────────────

class LoggerImpl implements ILogService {
	declare _serviceBrand: undefined;

	constructor(private readonly _targets: ILogTarget[]) { }

	private _logIt(level: LogLevel, message: string): void {
		for (const t of this._targets) { t.logIt(level, message); }
	}

	trace(message: string): void { this._logIt(LogLevel.Trace, message); }
	debug(message: string): void { this._logIt(LogLevel.Debug, message); }
	info(message: string): void { this._logIt(LogLevel.Info, message); }
	warn(message: string): void { this._logIt(LogLevel.Warning, message); }
	error(error: string | Error, message?: string): void {
		const msg = (error instanceof Error ? error.message : String(error)) + (message ? `: ${message}` : '');
		this._logIt(LogLevel.Error, msg);
	}
	show(preserveFocus?: boolean): void { for (const t of this._targets) { t.show?.(preserveFocus); } }
	createSubLogger(topic: string | readonly string[]): ILogService { return new SubLogger(this, topic); }
	withExtraTarget(target: ILogTarget): ILogService { return new LoggerWithExtraTargets(this, [target]); }
}

class SubLogger implements ILogService {
	declare _serviceBrand: undefined;
	private readonly _prefix: string;

	constructor(private readonly _parent: ILogService, topic: string | readonly string[], existingPrefix?: string) {
		const topics = Array.isArray(topic) ? topic : [topic];
		const newPrefix = topics.map(t => `[${t}]`).join('');
		this._prefix = existingPrefix ? existingPrefix + newPrefix : newPrefix;
	}

	private _pre(msg: string): string { return `${this._prefix} ${msg}`; }

	trace(message: string): void { this._parent.trace(this._pre(message)); }
	debug(message: string): void { this._parent.debug(this._pre(message)); }
	info(message: string): void { this._parent.info(this._pre(message)); }
	warn(message: string): void { this._parent.warn(this._pre(message)); }
	error(error: string | Error, message?: string): void {
		const prefixedMessage = message ? this._pre(message) : this._prefix;
		this._parent.error(error, prefixedMessage);
	}
	show(preserveFocus?: boolean): void { this._parent.show(preserveFocus); }
	createSubLogger(topic: string | readonly string[]): ILogService { return new SubLogger(this._parent, topic, this._prefix); }
	withExtraTarget(target: ILogTarget): ILogService { return this._parent.withExtraTarget(target); }
}

class LoggerWithExtraTargets implements ILogService {
	declare _serviceBrand: undefined;

	constructor(private readonly _parent: ILogService, private readonly _extraTargets: ILogTarget[]) { }

	trace(message: string): void { this._parent.trace(message); for (const t of this._extraTargets) { t.logIt(LogLevel.Trace, message); } }
	debug(message: string): void { this._parent.debug(message); for (const t of this._extraTargets) { t.logIt(LogLevel.Debug, message); } }
	info(message: string): void { this._parent.info(message); for (const t of this._extraTargets) { t.logIt(LogLevel.Info, message); } }
	warn(message: string): void { this._parent.warn(message); for (const t of this._extraTargets) { t.logIt(LogLevel.Warning, message); } }
	error(error: string | Error, message?: string): void {
		this._parent.error(error, message);
		const msg = (error instanceof Error ? error.message : String(error)) + (message ? `: ${message}` : '');
		for (const t of this._extraTargets) { t.logIt(LogLevel.Error, msg); }
	}
	show(preserveFocus?: boolean): void { this._parent.show(preserveFocus); for (const t of this._extraTargets) { t.show?.(preserveFocus); } }
	createSubLogger(topic: string | readonly string[]): ILogService { return new SubLogger(this, topic); }
	withExtraTarget(target: ILogTarget): ILogService { return new LoggerWithExtraTargets(this, [target]); }
}
