import { showErrorToast } from "$lib/api/error-toast";
import {
	getPreferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { decodeGeohash, encodeGeohash } from "$lib/model/geohash";
import { isMobilePlatform } from "$lib/platform/os";
import { now } from "$lib/util/clock";
import { distanceMeters } from "./distance";
import {
	reportLocationFailure,
	showLocationPermissionToast,
} from "./location-feedback";
import {
	type LocationOutcome,
	locationRequest,
} from "./location-request.svelte";

export const BACKGROUND_FIX_MAX_AGE_MS = 6 * 60 * 1000;
export const INTERACTIVE_FIX_MAX_AGE_MS = 10_000;
export const GPS_FIX_TIMEOUT_MS = 15_000;
const MIN_MOVE_METERS = 100;

class AutoLocation {
	#suspended = false;
	#promptAllowed = true;
	#failureReported = false;

	suspend(): void {
		this.#suspended = true;
	}

	resume(): void {
		this.#suspended = false;
	}

	async resolveGeohash(
		current: string,
		{ background = false } = {},
	): Promise<string> {
		const maxAgeMs = background
			? BACKGROUND_FIX_MAX_AGE_MS
			: INTERACTIVE_FIX_MAX_AGE_MS;
		if (!this.#canSample() || !this.#fixStale(maxAgeMs)) return current;
		const prompt = this.#promptAllowed && !this.#suspended;
		const outcome = await this.#timeboxedFix(prompt);
		if (prompt) this.#promptAllowed = false;
		if (outcome === "timeout") return current;
		if (this.#suspended) return current;
		if (outcome.status === "ok") {
			this.#failureReported = false;
			const moved =
				distanceMeters({
					from: decodeGeohash(current),
					to: outcome.coords,
				}) >= MIN_MOVE_METERS;
			return moved ? encodeGeohash(outcome.coords) : current;
		}
		if (outcome.status === "denied") {
			showLocationPermissionToast();
			setPreferences({ autoUpdateLocation: false }).catch(
				(error: unknown) => console.error(error),
			);
			return current;
		}
		if (outcome.status === "error") {
			console.error(outcome.error);
			this.#reportOnce(() => {
				showErrorToast({
					label: "Failed to update your location automatically",
					error: outcome.error,
				});
			});
		}
		return current;
	}

	async refreshStaleFix(): Promise<void> {
		if (!this.#canSample() || !this.#fixStale(INTERACTIVE_FIX_MAX_AGE_MS))
			return;
		const outcome = await this.#timeboxedFix(false);
		if (outcome !== "timeout") reportLocationFailure(outcome);
	}

	#canSample(): boolean {
		if (!isMobilePlatform()) return false;
		if (!getPreferencesSnapshot().autoUpdateLocation) return false;
		if (locationRequest.pending) return false;
		return !(typeof document !== "undefined" && document.hidden);
	}

	#fixStale(maxAgeMs: number): boolean {
		const { lastFixAt } = locationRequest;
		return lastFixAt === null || now() - lastFixAt >= maxAgeMs;
	}

	async #timeboxedFix(prompt: boolean): Promise<LocationOutcome | "timeout"> {
		const request = locationRequest.run({ prompt });
		const generation = locationRequest.generation;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const outcome = await Promise.race([
			request,
			new Promise<"timeout">((resolve) => {
				timer = setTimeout(
					() => resolve("timeout"),
					GPS_FIX_TIMEOUT_MS,
				);
			}),
		]);
		clearTimeout(timer);
		if (outcome === "timeout") locationRequest.abortStale(generation);
		return outcome;
	}

	#reportOnce(report: () => void): void {
		if (this.#failureReported) return;
		this.#failureReported = true;
		report();
	}
}

export const autoLocation = new AutoLocation();
