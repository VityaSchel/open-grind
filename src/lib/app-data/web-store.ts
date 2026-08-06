const PREFIX = "open-grind:app-data:";

function key(path: string): string {
	return `${PREFIX}${path}`;
}

export function existsWebAppDataFile(path: string): boolean {
	return localStorage.getItem(key(path)) !== null;
}

export function readWebAppDataFile(path: string): Uint8Array {
	const stored = localStorage.getItem(key(path));
	if (stored === null) throw new Error(`No app data file at ${path}`);
	return Uint8Array.from(atob(stored), (char) => char.charCodeAt(0));
}

export function removeWebAppDataFile(path: string): void {
	localStorage.removeItem(key(path));
}

export function writeWebAppDataFile({
	path,
	content,
}: {
	path: string;
	content: Uint8Array;
}): void {
	const binary = Array.from(content, (byte) =>
		String.fromCharCode(byte),
	).join("");
	localStorage.setItem(key(path), btoa(binary));
}
