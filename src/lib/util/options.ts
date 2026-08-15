export type Option<T extends string | number = number> = {
	value: T;
	label: string;
};

export function optionsFromMap<K extends number>(
	map: Record<K, string>,
): Option<K>[] {
	return Object.entries(map).map(([value, label]) => ({
		value: Number(value) as K,
		label: label as string,
	}));
}
