import { decode, encode } from "@msgpack/msgpack";
import { toast } from "svelte-sonner";
import z from "zod";

import { gridSearchFiltersSchema } from "$lib/components/filters/filters";
import { geohashSchema } from "$lib/model/geohash";
import { type UnitSystem, unitSystemSchema } from "$lib/units";
import { existsAppDataFile, readAppDataFile, writeAppDataFileAtomic } from ".";

const preferencesSchema = z.object({
	geohash: geohashSchema.nullable().default(null),
	gridSearchFilters: gridSearchFiltersSchema.optional(),
	revealMessageRead: z.boolean().default(false),
	revealProfileViews: z.boolean().default(false),
	units: unitSystemSchema.default("metric"),
	warnBeforeCopyingErrorDetails: z.boolean().default(true),
});

type Preferences = z.infer<typeof preferencesSchema>;

let writeQueue: Promise<unknown> = Promise.resolve();
let preferencesSnapshot = $state<Preferences>(preferencesSchema.parse({}));

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
	const run = writeQueue.then(task);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

let cache: Preferences | null = null;
let hydrating: Promise<Preferences> | null = null;

async function readFromDisk(): Promise<Preferences> {
	if (!(await existsAppDataFile("preferences.data"))) {
		return preferencesSchema.parse({});
	}
	const bytes = await readAppDataFile("preferences.data");
	return preferencesSchema.parse(decode(bytes));
}

export async function getPreferences(): Promise<Preferences> {
	if (cache !== null) return structuredClone(cache);
	hydrating ??= readFromDisk()
		.then((preferences) => {
			cache = preferences;
			preferencesSnapshot = preferences;
			return preferences;
		})
		.catch((error: unknown) => {
			toast.error("Failed to load preferences. Reset to defaults?", {
				action: {
					label: "Reset",
					onClick: () => void resetToDefaults(),
				},
				duration: 10000,
				id: "load-preferences-error",
			});
			throw error;
		})
		.finally(() => {
			hydrating = null;
		});
	return structuredClone(await hydrating);
}


export function getUnitsSnapshot(): UnitSystem {
	return preferencesSnapshot.units;
}

export async function hydratePreferences(): Promise<void> {
	await getPreferences();
}

export async function setPreferences(
	newValues: Partial<Preferences>,
): Promise<void> {
	await enqueueWrite(async () => {
		const oldValues = await getPreferences();
		const preferences = preferencesSchema.parse({
			...oldValues,
			...newValues,
		});
		await writeAppDataFileAtomic("preferences.data", encode(preferences));
		cache = preferences;
		preferencesSnapshot = preferences;
	});
}

async function resetToDefaults(): Promise<void> {
	await enqueueWrite(async () => {
		const preferences = preferencesSchema.parse({});
		await writeAppDataFileAtomic("preferences.data", encode(preferences));
		cache = preferences;
		preferencesSnapshot = preferences;
	});
	window.location.reload();
}
