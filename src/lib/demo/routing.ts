export type DemoResponse = { status: number; body: unknown };

export function num(value: string | null): number | undefined {
	if (value === null) return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}
