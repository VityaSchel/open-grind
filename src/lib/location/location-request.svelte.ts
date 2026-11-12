import {
	checkPermissions,
	getCurrentPosition,
	type PermissionStatus,
	requestPermissions,
} from "@tauri-apps/plugin-geolocation";

import { registerAccountCache } from "#lib/api/account-caches.ts";
import { currentPlatform, isMobilePlatform } from "#lib/platform/os.ts";
import { now } from "#lib/util/clock.ts";
import { Generation } from "#lib/util/generation.ts";

export type Coordinates = { lat: number; lon: number };
type Fix = Coordinates & { accuracyMeters: number };

export type MissingLocationGrant = "permission" | "precision";
export type LocationErrorReason = "disabled" | "timeout" | "failed";

export type LocationOutcome =
	| { status: "ok"; coords: Fix }
	| { status: "denied"; missing: MissingLocationGrant }
	| { status: "aborted" }
	| { status: "unsupported" }
	| { status: "error"; error: unknown; reason: LocationErrorReason };

const PLUGIN_ERROR_CODE = /^\[(\w+)\]/;

function missingGrant({
	coarseLocation,
}: PermissionStatus): MissingLocationGrant {
	switch (currentPlatform()) {
		case "android":
		case "ios":
			return coarseLocation === "granted" ? "precision" : "permission";
		case "linux":
		case "macos":
		case "windows":
			return "permission";
	}
}

function failureOutcome(error: unknown): LocationOutcome {
	const code =
		typeof error === "string"
			? PLUGIN_ERROR_CODE.exec(error)?.[1]
			: undefined;
	switch (code) {
		case "denied":
			return { status: "denied", missing: "permission" };
		case "disabled":
		case "timeout":
			return { status: "error", error, reason: code };
		default:
			return { status: "error", error, reason: "failed" };
	}
}

class LocationRequest {
	pending = $state(false);
	lastFix = $state<Fix | null>(null);
	lastFixAt: number | null = null;
	#generation = new Generation();

	get generation(): number {
		return this.#generation.current;
	}

	abort(): void {
		this.#generation.next();
		this.pending = false;
	}

	abortStale(generation: number): void {
		if (!this.#generation.isStale(generation)) this.abort();
	}

	async run({
		prompt = true,
	}: { prompt?: boolean } = {}): Promise<LocationOutcome> {
		if (!isMobilePlatform()) return { status: "unsupported" };
		const generation = this.#generation.next();
		this.pending = true;
		const superseded = () => this.#generation.isStale(generation);
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
			if (permissions.location !== "granted")
				return { status: "denied", missing: missingGrant(permissions) };
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
			return failureOutcome(error);
		} finally {
			if (!superseded()) this.pending = false;
		}
	}
}

export const locationRequest = new LocationRequest();

registerAccountCache({ reset: () => locationRequest.abort() });
