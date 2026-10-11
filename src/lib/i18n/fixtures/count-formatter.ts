import { setCountFormatter } from "../index";

export function restoreCountFormatter(): void {
	setCountFormatter(({ count }) => String(count));
}

export function bracketCounts(): (value: number) => string {
	const bracketed = (value: number) => `[${value}]`;
	setCountFormatter(({ count }) => bracketed(count));
	return bracketed;
}
