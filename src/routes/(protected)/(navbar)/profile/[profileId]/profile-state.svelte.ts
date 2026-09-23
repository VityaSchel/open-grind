import { showErrorToast } from "$lib/api/error-toast";
import {
	getFavoriteNote,
	invalidateFavoriteNote,
} from "$lib/api/users/favorites";
import {
	BlockedProfileError,
	getProfile,
	HiddenProfileError,
	isProfileCached,
	isUnviewableProfileError,
	mergeProfileEditIntoCaches,
	ProfileUnavailableError,
	refreshProfile,
} from "$lib/api/users/profiles";
import type { TapType } from "$lib/model/interest/taps";
import type { FavoriteNote } from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

export type FetchedProfile = { profile: Profile; note: FavoriteNote | null };

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
	#active = false;

	constructor({
		profileId,
		ourProfileId,
		fetched,
	}: {
		profileId: number;
		ourProfileId: number;
		fetched?: FetchedProfile;
	}) {
		this.profileId = profileId;
		this.ourProfileId = ourProfileId;
		if (fetched) {
			this.profile = fetched.profile;
			this.note = fetched.note;
			this.loading = false;
			return;
		}
		if (!Number.isFinite(profileId)) {
			this.error = new ProfileUnavailableError();
			this.loading = false;
			return;
		}
		void this.#load({ refresh: false });
	}

	get isOurProfile(): boolean {
		return this.profileId === this.ourProfileId;
	}

	destroy(): void {
		this.#destroyed = true;
	}

	activate(): void {
		if (this.#active) return;
		this.#active = true;
		if (this.profile?.isFavorite && !this.note) void this.#loadNote();
	}

	deactivate(): void {
		this.#active = false;
	}

	retry(): void {
		void this.#load({ refresh: false });
	}

	refresh(): void {
		if (this.loading || this.refreshing) return;
		void this.#load({ refresh: true });
	}

	revalidate(): void {
		if (this.loading || this.refreshing) return;
		if (this.error) {
			if (!isUnviewableProfileError(this.error)) this.retry();
			return;
		}
		if (!isProfileCached(this.profileId)) this.refresh();
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
			invalidateFavoriteNote({ profileId: this.profileId });
		} else {
			this.loading = true;
			this.error = null;
			this.profile = null;
			this.note = null;
		}
		const token = ++this.#fetchToken;
		try {
			const profile = refresh
				? await refreshProfile(this.profileId)
				: await getProfile(this.profileId);
			if (this.#superseded(token)) return;
			this.profile = profile;
			this.error = null;
			if (profile.isFavorite) void this.#loadNote();
		} catch (error) {
			if (this.#superseded(token)) return;
			if (refresh && !isUnviewableProfileError(error)) {
				console.error(error);
				showErrorToast({
					label: "Failed to refresh profile",
					error,
					onRetry: () => void this.refresh(),
				});
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
		if (!this.#active) return;
		const token = this.#fetchToken;
		try {
			const note = await getFavoriteNote({ profileId: this.profileId });
			if (this.#superseded(token)) return;
			this.note = note;
		} catch (error) {
			console.error(error);
		}
	}

	#superseded(token: number): boolean {
		return this.#destroyed || token !== this.#fetchToken;
	}
}
