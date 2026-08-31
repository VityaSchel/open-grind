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

export function labelFromMap({
	labels,
	id,
}: {
	labels: Record<number, string>;
	id: number;
}): string | undefined {
	return labels[id];
}

export function selectionKeepingUnlisted<T extends number>({
	values,
	selectedKeys,
	options,
}: {
	values: T[];
	selectedKeys: string[];
	options: Option<T>[];
}): T[] {
	const listed = new Set(options.map((option) => String(option.value)));
	const unlisted = values.filter((value) => !listed.has(String(value)));
	const selected = options
		.filter((option) => selectedKeys.includes(String(option.value)))
		.map((option) => option.value);
	return [...unlisted, ...selected];
}
