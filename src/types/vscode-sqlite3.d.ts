// Re-export @types/sqlite3 types for the @vscode/sqlite3 package,
// which is API-compatible with node-sqlite3 but ships its own prebuilt binaries.
declare module '@vscode/sqlite3' {
	export * from 'sqlite3';
}
