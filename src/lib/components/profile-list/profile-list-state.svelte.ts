import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { showErrorToast } from "$lib/api/error-toast";
import { getProfiles } from "$lib/api/users/profiles";
import type { ProfileListOptions, ProfileListProfile } from "./profile-list";

const CHUNK_SIZE = 50;

export class ProfileListState {
	ids: number[] = $state.raw([]);
	loading = $state(true);
	error: Error | null = $state(null);

	#profiles = new SvelteMap<number, ProfileListProfile | null>();
	#turnedOff = new SvelteSet<number>();
	#submitting = new SvelteSet<number>();
	#requestedChunks = new SvelteSet<number>();
	#visible = { start: 0, end: 0 };
	#resolving = false;
	#token = 0;
	#options: () => ProfileListOptions;

	constructor(options: () => ProfileListOptions) {
		this.#options = options;
		void this.load();
	}

	profile(profileId: number): ProfileListProfile | null | undefined {
		return this.#profiles.get(profileId);
	}

	isOn(profileId: number): boolean {
		return !this.#turnedOff.has(profileId);
	}

	isSubmitting(profileId: number): boolean {
		return this.#submitting.has(profileId);
	}

	async load(): Promise<void> {
		const token = ++this.#token;
		this.loading = true;
		this.error = null;
		this.#profiles.clear();
		this.#requestedChunks.clear();
		try {
			const ids = await this.#options().loadIds();
			if (token !== this.#token) return;
			this.ids = ids;
			if (this.#options().eager)
				this.#visible = { start: 0, end: ids.length };
		} catch (caught) {
			if (token !== this.#token) return;
			console.error(caught);
			this.error =
				caught instanceof Error
					? caught
					: new Error("Failed to load profiles", { cause: caught });
			return;
		} finally {
			if (token === this.#token) this.loading = false;
		}
		void this.#resolveVisible();
	}

	setVisible(visible: { start: number; end: number }): void {
		this.#visible = visible;
		untrack(() => void this.#resolveVisible());
	}

	dispose(): void {
		this.#token += 1;
	}

	async toggle(profileId: number): Promise<void> {
		if (this.#submitting.has(profileId)) return;
		const turningOn = this.#turnedOff.has(profileId);
		const { setOn, errorLabel } = this.#options();
		this.#submitting.add(profileId);
		this.#setTurnedOff({ profileId, turnedOff: !turningOn });
		try {
			await setOn({ profileId, on: turningOn });
		} catch (error) {
			this.#setTurnedOff({ profileId, turnedOff: turningOn });
			console.error(error);
			showErrorToast({
				label: turningOn ? errorLabel.turningOn : errorLabel.turningOff,
				error,
			});
		} finally {
			this.#submitting.delete(profileId);
		}
	}

	#setTurnedOff({
		profileId,
		turnedOff,
	}: {
		profileId: number;
		turnedOff: boolean;
	}): void {
		if (turnedOff) this.#turnedOff.add(profileId);
		else this.#turnedOff.delete(profileId);
	}

	#pendingChunks(): number[] {
		const { start, end } = this.#visible;
		if (end <= start) return [];
		const chunks: number[] = [];
		const last = Math.floor((end - 1) / CHUNK_SIZE);
		for (let chunk = Math.floor(start / CHUNK_SIZE); chunk <= last; chunk++)
			if (!this.#requestedChunks.has(chunk)) chunks.push(chunk);
		return chunks;
	}

	async #resolveVisible(): Promise<void> {
		if (this.#resolving) return;
		const chunks = this.#pendingChunks();
		if (chunks.length === 0) return;
		this.#resolving = true;
		const token = this.#token;
		const ids = chunks.flatMap((chunk) =>
			this.ids.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE),
		);
		for (const chunk of chunks) this.#requestedChunks.add(chunk);
		try {
			const resolved = await getProfiles(ids);
			if (token === this.#token) {
				for (const id of ids) this.#profiles.set(id, null);
				for (const profile of resolved)
					this.#profiles.set(profile.profileId, profile);
			}
		} catch (error) {
			if (token === this.#token) {
				for (const chunk of chunks) this.#requestedChunks.delete(chunk);
				console.error(error);
				showErrorToast({
					label: "Failed to load profiles",
					error,
					onRetry: () => void this.#resolveVisible(),
				});
				return;
			}
		} finally {
			this.#resolving = false;
		}
		void this.#resolveVisible();
	}
}
