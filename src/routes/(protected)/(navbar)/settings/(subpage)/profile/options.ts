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

export const fieldLimits = {
	displayName: 25,
	aboutMe: 255,
} as const;

export const maxProfileTags = 10;

export const heightCmRange = { min: 120, max: 250 } as const;
export const weightKgRange = { min: 30, max: 250 } as const;
export const ageRange = { min: 18, max: 99 } as const;
