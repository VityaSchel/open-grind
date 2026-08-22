import {
	checkPermissions,
	getCurrentPosition,
	requestPermissions,
} from "@tauri-apps/plugin-geolocation";

import { registerAccountCache } from "$lib/api/account-caches";
import { isMobilePlatform } from "$lib/platform/os";
import { now } from "$lib/util/clock";

export type Coordinates = { lat: number; lon: number };
type Fix = Coordinates & { accuracyMeters: number };

export type LocationOutcome =
	| { status: "ok"; coords: Fix }
	| { status: "denied" }
	| { status: "aborted" }
	| { status: "unsupported" }
	| { status: "error"; error: unknown };

class LocationRequest {
	pending = $state(false);
	lastFix = $state<Fix | null>(null);
	lastFixAt: number | null = null;
	#token = 0;

	get generation(): number {
		return this.#token;
	}

	abort(): void {
		this.#token += 1;
		this.pending = false;
	}

	abortStale(generation: number): void {
		if (this.#token === generation) this.abort();
	}

	async run({
		prompt = true,
	}: { prompt?: boolean } = {}): Promise<LocationOutcome> {
		if (!isMobilePlatform()) return { status: "unsupported" };
		const token = ++this.#token;
		this.pending = true;
		const superseded = () => token !== this.#token;
		try {
			let permissions = await checkPermissions();
			if (superseded()) return { status: "aborted" };
			if (
				prompt &&
				(permissions.location === "prompt" ||
					permissions.location === "prompt-with-rationale")
			) {
				permissions = await requestPermissions(["location"]);
				if (superseded()) return { status: "aborted" };
			}
			if (permissions.location !== "granted") return { status: "denied" };
			const {
				coords: { latitude, longitude, accuracy },
			} = await getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 0,
				maximumAge: 0,
			});
			if (superseded()) return { status: "aborted" };
			const fix = {
				lat: latitude,
				lon: longitude,
				accuracyMeters: accuracy,
			};
			this.lastFix = fix;
			this.lastFixAt = now();
			return { status: "ok", coords: fix };
		} catch (error) {
			if (superseded()) return { status: "aborted" };
			return { status: "error", error };
		} finally {
			if (!superseded()) this.pending = false;
		}
	}
}

export const locationRequest = new LocationRequest();

registerAccountCache({ reset: () => locationRequest.abort() });
