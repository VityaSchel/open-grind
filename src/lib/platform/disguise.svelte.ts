import { invoke } from "@tauri-apps/api/core";
import { goto } from "$app/navigation";
import z from "zod";

import { currentPlatform } from "./os";

export const ORIGINAL_DISGUISE = "original";

const disguiseStateSchema = z.object({
	available: z.boolean(),
	current: z.string(),
	presets: z.array(z.object({ id: z.string(), name: z.string() })),
	renameNeedsAdmin: z.boolean(),
});

export type DisguisePreset = z.infer<
	typeof disguiseStateSchema
>["presets"][number];

type State = z.infer<typeof disguiseStateSchema>;

const unavailable: State = {
	available: false,
	current: ORIGINAL_DISGUISE,
	presets: [],
	renameNeedsAdmin: false,
};

let state = $state<State>(unavailable);
let hydrated = false;

function offersDisguises(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return true;
		case "ios":
			return false;
	}
}

async function read(): Promise<State> {
	if (!offersDisguises()) return unavailable;
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

export function disguiseRenameNeedsAdmin(): boolean {
	return state.renameNeedsAdmin;
}

const DISGUISE_FAILURES = ["nameTaken", "renameNeedsAdmin", "failed"] as const;

export type DisguiseFailure = (typeof DISGUISE_FAILURES)[number];

const disguiseErrorSchema = z.object({ reason: z.enum(DISGUISE_FAILURES) });

export function disguiseFailure(error: unknown): DisguiseFailure {
	return disguiseErrorSchema.safeParse(error).data?.reason ?? "failed";
}

const previewsSchema = z.record(z.string(), z.string());

export async function loadDisguisePreviews(): Promise<Record<string, string>> {
	if (!offersDisguises()) return {};
	const value = await invoke("disguise_previews").catch(() => null);
	return previewsSchema.safeParse(value).data ?? {};
}

export async function selectDisguise(
	id: string,
	{ resume }: { resume: string | null },
): Promise<void> {
	try {
		await invoke("disguise_select", { id, resume });
	} finally {
		state = await read();
	}
}

const resumeSchema = z.string().startsWith("/settings/");

export async function reopenAfterDisguiseRestart({
	trail,
}: {
	trail: (path: string) => string[];
}): Promise<void> {
	if (!offersDisguises()) return;
	const answer = await invoke("disguise_take_resume").catch(() => null);
	const path = resumeSchema.safeParse(answer).data;
	if (!path) return;
	for (const step of trail(path)) await goto(step);
}
