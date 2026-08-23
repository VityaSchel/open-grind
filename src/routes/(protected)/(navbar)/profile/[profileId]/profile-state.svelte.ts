import { showErrorToast } from "$lib/api/error-toast";
import { recordProfileView } from "$lib/api/interest/views";
import {
	getFavoriteNote,
	invalidateFavoriteNote,
} from "$lib/api/users/favorites";
import {
	BlockedProfileError,
	getProfile,
	HiddenProfileError,
	invalidateProfile,
	isUnviewableProfileError,
	mergeProfileEditIntoCaches,
	ProfileUnavailableError,
} from "$lib/api/users/profiles";
import { getPreferences } from "$lib/app-data/preferences.svelte";
import type { TapType } from "$lib/model/interest/taps";
import type { FavoriteNote } from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

export class ProfileState {
	profile: Profile | null = $state(null);
	note: FavoriteNote | null = $state(null);
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);

	readonly profileId: number;
	readonly ourProfileId: number;

	#fetchToken = 0;
	#destroyed = false;

	constructor({
		profileId,
		ourProfileId,
	}: {
		profileId: number;
		ourProfileId: number;
	}) {
		this.profileId = profileId;
		this.ourProfileId = ourProfileId;
		if (!Number.isFinite(profileId)) {
			this.error = new ProfileUnavailableError();
			this.loading = false;
			return;
		}
		void this.#load({ refresh: false });
		if (!this.isOurProfile) void this.#recordView();
	}

	get isOurProfile(): boolean {
		return this.profileId === this.ourProfileId;
	}

	destroy(): void {
		this.#destroyed = true;
	}

	retry(): void {
		void this.#load({ refresh: false });
	}

	refresh(): void {
		if (this.loading || this.refreshing) return;
		void this.#load({ refresh: true });
	}

	markBlocked(): void {
		this.error = new BlockedProfileError({ blockedByUs: true });
	}

	markHidden(): void {
		this.error = new HiddenProfileError();
	}

	markViewable(): void {
		this.error = null;
		if (!this.profile) this.retry();
	}

	setTap(tapType: TapType | null): void {
		const { profile } = this;
		if (!profile) return;
		const tapped = tapType !== null;
		profile.tapType = tapType;
		profile.tapped = tapped;
		mergeProfileEditIntoCaches({
			cacheProfileId: profile.profileId,
			patch: { tapType, tapped },
		});
	}

	setFavorite(isFavorite: boolean): void {
		const { profile } = this;
		if (!profile) return;
		profile.isFavorite = isFavorite;
		mergeProfileEditIntoCaches({
			cacheProfileId: profile.profileId,
			patch: { isFavorite },
		});
		if (!isFavorite) this.note = null;
		else if (!this.note) void this.#loadNote();
	}

	setNote(note: FavoriteNote): void {
		this.note = note;
	}

	async #load({ refresh }: { refresh: boolean }): Promise<void> {
		if (refresh) {
			this.refreshing = true;
			invalidateProfile(this.profileId);
			invalidateFavoriteNote({ profileId: this.profileId });
		} else {
			this.loading = true;
			this.error = null;
			this.profile = null;
			this.note = null;
		}
		const token = ++this.#fetchToken;
		try {
			const profile = await getProfile(this.profileId);
			if (this.#superseded(token)) return;
			this.profile = profile;
			this.error = null;
			if (profile.isFavorite) void this.#loadNote();
		} catch (error) {
			if (this.#superseded(token)) return;
			if (refresh && !isUnviewableProfileError(error)) {
				console.error(error);
				showErrorToast({ label: "Failed to refresh profile", error });
				return;
			}
			this.error =
				error instanceof Error ? error : new Error(String(error));
			this.profile = null;
		} finally {
			if (!this.#superseded(token)) {
				this.loading = false;
				this.refreshing = false;
			}
		}
	}

	async #loadNote(): Promise<void> {
		const token = this.#fetchToken;
		try {
			const note = await getFavoriteNote({ profileId: this.profileId });
			if (this.#superseded(token)) return;
			this.note = note;
		} catch (error) {
			console.error(error);
		}
	}

	async #recordView(): Promise<void> {
		try {
			const { revealProfileViews } = await getPreferences();
			if (!revealProfileViews) return;
			await recordProfileView({ profileId: this.profileId });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to record profile view preference or action",
				error,
			});
		}
	}

	#superseded(token: number): boolean {
		return this.#destroyed || token !== this.#fetchToken;
	}
}
