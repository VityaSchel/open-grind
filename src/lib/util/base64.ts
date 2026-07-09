export function fromBase64(b64: string): Uint8Array {
	if (typeof Uint8Array.fromBase64 === "function") {
		return Uint8Array.fromBase64(b64);
	}
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function toBase64(bytes: Uint8Array): string {
	if (typeof bytes.toBase64 === "function") {
		return bytes.toBase64();
	}
	let bin = "";
	for (let i = 0; i < bytes.byteLength; i++)
		bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}
