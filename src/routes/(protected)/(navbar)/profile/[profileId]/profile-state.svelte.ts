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
import { Generation } from "$lib/util/generation";
import type { TapType } from "$lib/model/interest/taps";
import type { FavoriteNote } from "$lib/model/users/favorites";
import type { Profile } from "$lib/model/users/profiles";

export type FetchedProfile = { profile: Profile; note: FavoriteNote | null };

export type PendingViewabilityChange = {
	revert: () => void;
	settle: () => void;
};

type ViewabilityFailureNotice =
	| { failureLabel: string }
	| { showFailure: (error: unknown) => void };

export async function applyViewabilityChange(
	options: {
		change: () => PendingViewabilityChange;
		request: () => Promise<unknown>;
	} & ViewabilityFailureNotice,
): Promise<void> {
	const { revert, settle } = options.change();
	try {
		await options.request();
		settle();
	} catch (error) {
		revert();
		console.error(error);
		if ("showFailure" in options) options.showFailure(error);
		else showErrorToast({ label: options.failureLabel, error });
	}
}

export class ProfileState {
	profile: Profile | null = $state(null);
	note: FavoriteNote | null = $state(null);
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	changingViewability = $state(false);

	readonly profileId: number;
	readonly ourProfileId: number;

	#generation = new Generation();
	#viewabilityChanges = new Generation();
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
		if (this.#busy) return;
		void this.#load({ refresh: true });
	}

	revalidate(): void {
		if (this.#busy) return;
		if (this.error) {
			if (!isUnviewableProfileError(this.error)) this.retry();
			return;
		}
		if (!isProfileCached(this.profileId)) this.refresh();
	}

	markBlocked(): PendingViewabilityChange {
		return this.#changeViewability({
			error: new BlockedProfileError({ blockedByUs: true }),
		});
	}

	markHidden(): PendingViewabilityChange {
		return this.#changeViewability({ error: new HiddenProfileError() });
	}

	markViewable(): PendingViewabilityChange {
		return this.#changeViewability({ error: null });
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

	get #busy(): boolean {
		return this.loading || this.refreshing || this.changingViewability;
	}

	#changeViewability({
		error,
	}: {
		error: Error | null;
	}): PendingViewabilityChange {
		const generation = this.#viewabilityChanges.next();
		const superseded = () => this.#viewabilityChanges.isStale(generation);
		const previous = this.error;
		this.error = error;
		this.changingViewability = true;
		return {
			revert: () => {
				if (superseded()) return;
				this.changingViewability = false;
				if (this.error === error) this.error = previous;
			},
			settle: () => {
				if (superseded()) return;
				this.changingViewability = false;
				if (!this.error && !this.profile) this.retry();
			},
		};
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
		const generation = this.#generation.next();
		const errorBeforeLoad = this.error;
		try {
			const profile = refresh
				? await refreshProfile(this.profileId)
				: await getProfile(this.profileId);
			if (this.#superseded(generation)) return;
			this.profile = profile;
			if (this.error === errorBeforeLoad) this.error = null;
			if (profile.isFavorite) void this.#loadNote();
		} catch (error) {
			if (this.#superseded(generation)) return;
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
			if (!this.#superseded(generation)) {
				this.loading = false;
				this.refreshing = false;
			}
		}
	}

	async #loadNote(): Promise<void> {
		if (!this.#active) return;
		const generation = this.#generation.current;
		try {
			const note = await getFavoriteNote({ profileId: this.profileId });
			if (this.#superseded(generation)) return;
			this.note = note;
		} catch (error) {
			console.error(error);
		}
	}

	#superseded(generation: number): boolean {
		return this.#destroyed || this.#generation.isStale(generation);
	}
}
