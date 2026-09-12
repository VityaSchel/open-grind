import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import {
	confirmAccountSwitch,
	googleHandbackState,
} from "$lib/api/google-handback-state.svelte";
import { callMethod, loginResultSchema } from "$lib/api/methods";
import { finishSignIn, reportSignInFailure } from "$lib/api/sign-in";
import { clearAccountState } from "$lib/api/sign-out";
import { isAndroidPlatform } from "$lib/platform/os";

const HANDBACK_EVENT = "google-oauth:handback";
const READY_ATTEMPTS = 25;
const READY_POLL_MS = 200;

const available = () => isTauri() && isAndroidPlatform();

async function pending(): Promise<boolean> {
	try {
		return (await invoke<boolean>("google_handback_pending")) === true;
	} catch (error) {
		console.error(error);
		return false;
	}
}

async function discard(): Promise<void> {
	try {
		await invoke("discard_google_handback");
	} catch (error) {
		console.error(error);
	}
}

async function exchange() {
	const result = await invoke("take_google_handback");
	return result === null || result === undefined
		? null
		: loginResultSchema.parse(result);
}

let running: Promise<void> | null = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backendAnswers(): Promise<boolean> {
	for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
		if (await invoke<boolean>("backend_ready").catch(() => false)) {
			return true;
		}
		await wait(READY_POLL_MS);
	}
	return false;
}

async function mayHaveSession(): Promise<boolean> {
	if (!(await backendAnswers())) return true;
	return (await callMethod("auth_state")) !== null;
}

async function consume(): Promise<void> {
	if (!(await pending())) return;

	let replacingAccount = false;
	if (await mayHaveSession()) {
		if (!(await confirmAccountSwitch())) {
			await discard();
			return;
		}
		replacingAccount = true;
	} else {
		googleHandbackState.phase = "signingIn";
		await goto("/auth/sign-in/google");
	}

	try {
		const result = await exchange();
		if (!result) {
			toast.error("That Google sign-in expired. Try again.");
			return;
		}
		if (replacingAccount) await clearAccountState();
		finishSignIn(result);
		if (result.restriction) await goto("/auth/sign-in");
	} catch (error) {
		reportSignInFailure({ error, label: "Sign in with Google" });
		if (!replacingAccount) await goto("/auth/sign-in/google");
	} finally {
		googleHandbackState.phase = "idle";
	}
}

export function consumeGoogleHandback(): Promise<void> {
	running ??= consume().finally(() => {
		running = null;
	});
	return running;
}

export async function startGoogleHandbackWatch(): Promise<() => void> {
	if (!available()) return () => {};

	const unlisten = await listen(HANDBACK_EVENT, () => {
		void consumeGoogleHandback();
	});
	void consumeGoogleHandback();
	return unlisten;
}
