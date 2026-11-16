import { defaultCountFormatter, setCountFormatter } from "../index";

export function restoreCountFormatter(): void {
	setCountFormatter(defaultCountFormatter);
}

export function bracketCounts(): (value: number) => string {
	const bracketed = (value: number) => `[${value}]`;
	setCountFormatter(({ count }) => bracketed(count));
	return bracketed;
}
