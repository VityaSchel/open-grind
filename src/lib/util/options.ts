export type Option<T extends string | number = number> = {
	value: T;
	label: string;
};

export function optionsFromMap(map: Record<number, string>): Option[] {
	return Object.entries(map).map(([value, label]) => ({
		value: Number(value),
		label,
	}));
}
