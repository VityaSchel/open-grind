export const hashText = (text: string) =>
	Bun.SHA256.hash(text.trim(), "hex").slice(0, 16);
