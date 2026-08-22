export async function only(pattern: string, within: string): Promise<string> {
	const found: string[] = [];
	const scan = new Bun.Glob(pattern).scan({ cwd: within, onlyFiles: false });
	for await (const path of scan) found.push(`${within}/${path}`);
	const [match] = found;
	if (!match || found.length > 1) {
		throw new Error(
			`expected exactly one ${pattern} in ${within}, found ${found.length}`,
		);
	}
	return match;
}
