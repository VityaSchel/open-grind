import { invoke, isTauri } from "@tauri-apps/api/core";
import z from "zod";

export const ORIGINAL_DISGUISE = "original";

const disguiseStateSchema = z.object({
	available: z.boolean(),
	current: z.string(),
	presets: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type DisguisePreset = z.infer<
	typeof disguiseStateSchema
>["presets"][number];

type State = z.infer<typeof disguiseStateSchema>;

const unavailable: State = {
	available: false,
	current: ORIGINAL_DISGUISE,
	presets: [],
};

let state = $state<State>(unavailable);
let hydrated = false;

async function read(): Promise<State> {
	if (!isTauri()) return unavailable;
	const value = await invoke("disguise_state").catch(() => null);
	return disguiseStateSchema.safeParse(value).data ?? unavailable;
}

export async function hydrateDisguiseState(): Promise<void> {
	if (hydrated) return;
	hydrated = true;
	state = await read();
}

export function disguiseAvailable(): boolean {
	return state.available;
}

export function currentDisguise(): string {
	return state.current;
}

export function disguisePresets(): DisguisePreset[] {
	return state.presets;
}

export async function selectDisguise(id: string): Promise<void> {
	await invoke("disguise_select", { id });
	state = await read();
}
