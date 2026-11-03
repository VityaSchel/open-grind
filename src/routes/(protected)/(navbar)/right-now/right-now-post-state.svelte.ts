import { untrack } from "svelte";
import { toast } from "svelte-sonner";

import {
	accountEpoch,
	accountScoped,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { appLifecycle } from "#lib/api/app-lifecycle.svelte.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	createRightNowPost,
	getActiveRightNowPost,
	getRightNowPostEntitlements,
	NoFreeRightNowPostsError,
	RightNowPostAlreadyRunningError,
	RightNowSessionEndedError,
	setRightNowPostHidden,
	updateRightNowPost,
} from "#lib/api/right-now/post.ts";
import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { atHomeLocation } from "#lib/entitlements/honduras-hold.ts";
import { storeLocation } from "#lib/grid/grid.ts";
import {
	freeRightNowPostsLeft,
	type RightNowPostChanges,
	type RightNowPostDetails,
	type RightNowPostRequest,
} from "#lib/model/right-now/post.ts";
import { now } from "#lib/util/clock.ts";
import { Generation } from "#lib/util/generation.ts";
import { getRightNowFeedState } from "./right-now-feed-state.svelte";
import {
	isAwaitingModeration,
	isLivePost,
	rejectedParts,
	rejectionKeys,
	repostRequest,
	textRejectReasonLabel,
} from "./right-now-post-fields";

const SECOND = 1_000;
const TICK_MS = SECOND;
const FAST_POLL_MS = 10 * SECOND;
const FAST_POLL_WINDOW_MS = 60 * SECOND;
const SLOW_POLL_MS = 60 * SECOND;
const EXPIRY_RECHECK_MS = 10 * SECOND;
const REJECTED_TOAST_ID = "right-now-post-rejected";
const ENDED_TOAST_ID = "right-now-post-ended";
const NO_FREE_POSTS_TOAST_ID = "right-now-no-free-posts";
const ALREADY_RUNNING_TOAST_ID = "right-now-post-running";

export type RightNowPostRejection = {
	text: boolean;
	photo: boolean;
	reasons: string[];
};

class SignedOutBeforePostRequest extends Error {}

export class RightNowPostState {
	post: RightNowPostDetails | null = $state.raw(null);
	freePostsLeft: number | "unlimited" | null = $state(null);
	loading = $state(true);
	error: unknown = $state(null);
	joining = $state(false);
	saving = $state(false);
	lastPost: RightNowPostDetails | null = $state.raw(null);

	#clock = $state(now());

	timeLeftMs: number = $derived.by(() => {
		const expiration = this.post?.expiration ?? null;
		return expiration === null ? 0 : Math.max(0, expiration - this.#clock);
	});

	status: "off" | "active" | "none" = $derived.by(() => {
		if (this.post === null) return "none";
		return this.post.postStatus === "HIDDEN" ? "off" : "active";
	});

	pendingModeration: boolean = $derived(
		this.post !== null && isAwaitingModeration(this.post),
	);

	rejected: RightNowPostRejection = $derived.by(() => {
		const { text, photos } = rejectedParts(this.post);
		return {
			text: text !== null,
			photo: photos.length > 0,
			reasons: [
				...(text?.rejectReasons ?? []).map((reason) =>
					textRejectReasonLabel({ reason }),
				),
				...photos.flatMap(({ reason }) =>
					reason === null ? [] : [reason],
				),
			],
		};
	});

	readonly #profileId: number;
	readonly #postReads = new Generation();
	readonly #allowanceReads = new Generation();
	readonly #unsubscribeStartOver: () => void;
	#views = 0;
	#viewLeft = false;
	#loaded = false;
	#destroyed = false;
	#loadInFlight: Promise<void> | null = null;
	#pendingSince: number | null = null;
	#notifiedRejections: string[] = [];
	#sheetListeners: (() => void)[] = [];
	#ticker: ReturnType<typeof setInterval> | null = null;
	#pollTimer: ReturnType<typeof setTimeout> | null = null;
	#expiryTimer: ReturnType<typeof setTimeout> | null = null;
	#expiryFor: number | null = null;
	#expiryRechecks = 0;

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
		this.#unsubscribeStartOver = getRightNowFeedState(
			profileId,
		).onStartOver(() => {
			if (untrack(() => this.post) === null) this.#refreshAllowance();
		});
	}

	load(): Promise<void> {
		if (this.#destroyed) return Promise.resolve();
		this.#loadInFlight ??= this.#load().finally(() => {
			this.#loadInFlight = null;
		});
		return this.#loadInFlight;
	}

	join(): Promise<boolean> {
		return this.#create({
			request: { shareLocation: "NONE", media: [], hosting: false },
			failureLabel: "Failed to join Right Now",
			onRetry: () => void this.join(),
		});
	}

	goAgain(): Promise<boolean> {
		const lastPost = this.lastPost;
		if (lastPost === null) return Promise.resolve(false);
		return this.#create({
			request: repostRequest(lastPost),
			failureLabel: "Failed to start a new Right Now session",
			onRetry: () => void this.goAgain(),
		});
	}

	async save({
		changes,
	}: {
		changes: RightNowPostChanges;
	}): Promise<boolean> {
		const post = this.post;
		if (this.#destroyed || post === null || this.saving) return false;
		if (Object.keys(changes).length === 0) return true;
		const epoch = accountEpoch();
		this.saving = true;
		try {
			await updateRightNowPost({ postId: post.id, changes });
			if (this.#isGone(epoch)) return false;
			if (changes.text !== undefined || changes.media !== undefined) {
				this.#pendingSince = null;
				this.#clearPoll();
			}
			this.#mergeIntoPost({
				postId: post.id,
				merge: (current) => ({
					...current,
					hosting: changes.hosting ?? current.hosting,
					shareLocation:
						changes.shareLocation ?? current.shareLocation,
					locationRadius:
						changes.locationRadius ?? current.locationRadius,
				}),
			});
			this.#refreshFeed();
			await this.#refetch({ epoch });
			return true;
		} catch (error) {
			if (this.#isGone(epoch)) return false;
			if (error instanceof RightNowSessionEndedError) {
				await this.#refetch({ epoch });
				return false;
			}
			console.error(error);
			showErrorToast({
				label: "Failed to save your post",
				error,
				onRetry: () => void this.save({ changes }),
			});
			return false;
		} finally {
			this.saving = false;
		}
	}

	async setHidden({ hidden }: { hidden: boolean }): Promise<boolean> {
		const post = this.post;
		if (this.#destroyed || post === null || this.saving) return false;
		if ((post.postStatus === "HIDDEN") === hidden) return true;
		const epoch = accountEpoch();
		this.saving = true;
		try {
			await setRightNowPostHidden({ postId: post.id, hidden });
			if (this.#isGone(epoch)) return false;
			this.#mergeIntoPost({
				postId: post.id,
				merge: (current) => ({
					...current,
					postStatus: hidden ? "HIDDEN" : "ACTIVE",
				}),
			});
			this.#refreshFeed();
			await this.#refetch({ epoch });
			return true;
		} catch (error) {
			if (this.#isGone(epoch)) return false;
			if (error instanceof RightNowSessionEndedError) {
				await this.#refetch({ epoch });
				return false;
			}
			console.error(error);
			showErrorToast({
				label: hidden
					? "Failed to turn off Right Now"
					: "Failed to turn on Right Now",
				error,
				onRetry: () => void this.setHidden({ hidden }),
			});
			return false;
		} finally {
			this.saving = false;
		}
	}

	onSheetRequest(listener: () => void): () => void {
		this.#sheetListeners = [...this.#sheetListeners, listener];
		return () => {
			this.#sheetListeners = this.#sheetListeners.filter(
				(existing) => existing !== listener,
			);
		};
	}

	attachView(): () => void {
		untrack(() => {
			this.#views += 1;
			if (!this.#loaded || this.#viewLeft) void this.load();
			this.#viewLeft = false;
			this.#syncTimers();
		});
		let attached = true;
		return () => {
			if (!attached) return;
			attached = false;
			untrack(() => {
				this.#views -= 1;
				if (this.#views === 0) this.#viewLeft = true;
				this.#syncTimers();
			});
		};
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#postReads.next();
		this.#allowanceReads.next();
		this.#unsubscribeStartOver();
		this.#sheetListeners = [];
		this.#syncTimers();
	}

	async #load(): Promise<void> {
		const epoch = accountEpoch();
		if (!this.#loaded) this.loading = true;
		try {
			await Promise.all([
				this.#readPost({ epoch }),
				this.#readAllowance({ epoch }),
			]);
			if (this.#isGone(epoch)) return;
			this.#loaded = true;
			this.error = null;
		} catch (error) {
			if (this.#isGone(epoch)) return;
			console.error(error);
			this.error = error;
		} finally {
			if (!this.#isGone(epoch)) this.loading = false;
		}
	}

	async #create({
		request,
		failureLabel,
		onRetry,
	}: {
		request: RightNowPostRequest;
		failureLabel: string;
		onRetry: () => void;
	}): Promise<boolean> {
		if (this.#destroyed || this.joining || this.post !== null) return false;
		const epoch = accountEpoch();
		this.joining = true;
		try {
			const created = await this.#atHome({
				epoch,
				request: () => createRightNowPost({ post: request }),
			});
			if (this.#isGone(epoch)) return false;
			this.#postReads.next();
			this.lastPost = null;
			if (typeof this.freePostsLeft === "number")
				this.freePostsLeft = Math.max(0, this.freePostsLeft - 1);
			this.#applyPost(created);
			this.#refreshFeed();
			return true;
		} catch (error) {
			if (this.#isGone(epoch)) return false;
			if (error instanceof NoFreeRightNowPostsError) {
				this.freePostsLeft = 0;
				toast.error("No free posts left in this area", {
					id: NO_FREE_POSTS_TOAST_ID,
				});
				return false;
			}
			if (error instanceof RightNowPostAlreadyRunningError) {
				toast("You already have a post running", {
					id: ALREADY_RUNNING_TOAST_ID,
				});
				await this.#refetch({ epoch });
				return false;
			}
			console.error(error);
			showErrorToast({ label: failureLabel, error, onRetry });
			return false;
		} finally {
			this.joining = false;
		}
	}

	#atHome<T>({
		epoch,
		request,
	}: {
		epoch: number;
		request: () => Promise<T>;
	}): Promise<T> {
		return atHomeLocation(async () => {
			if (!isAccountEpochCurrent(epoch))
				throw new SignedOutBeforePostRequest();
			const { geohash = null } = await getPreferences();
			if (geohash !== null) await storeLocation({ geohash });
			return request();
		});
	}

	async #readPost({ epoch }: { epoch: number }): Promise<void> {
		const read = this.#postReads.next();
		const post = await getActiveRightNowPost();
		if (this.#isGone(epoch) || this.#postReads.isStale(read)) return;
		this.#applyPost(post);
	}

	async #readAllowance({ epoch }: { epoch: number }): Promise<void> {
		const read = this.#allowanceReads.next();
		const entitlements = await this.#atHome({
			epoch,
			request: getRightNowPostEntitlements,
		});
		if (this.#isGone(epoch) || this.#allowanceReads.isStale(read)) return;
		this.freePostsLeft = freeRightNowPostsLeft(entitlements);
	}

	async #refetch({ epoch }: { epoch: number }): Promise<void> {
		try {
			await this.#readPost({ epoch });
		} catch (error) {
			if (!this.#isGone(epoch)) console.error(error);
		}
	}

	#refreshAllowance(): void {
		const epoch = accountEpoch();
		void this.#readAllowance({ epoch }).catch((error: unknown) => {
			if (!this.#isGone(epoch)) console.error(error);
		});
	}

	#refreshFeed(): void {
		void getRightNowFeedState(this.#profileId)
			.refreshOrDefer({ attended: true })
			.catch((error: unknown) => console.error(error));
	}

	#mergeIntoPost({
		postId,
		merge,
	}: {
		postId: number;
		merge: (post: RightNowPostDetails) => RightNowPostDetails;
	}): void {
		this.#postReads.next();
		const current = this.post;
		if (current?.id === postId) this.#applyPost(merge(current));
	}

	#applyPost(next: RightNowPostDetails | null): void {
		const previous = this.post;
		const post = next !== null && isLivePost(next) ? next : null;
		this.post = post;
		this.#clock = now();
		if (previous !== null && post === null) this.#ended(previous);
		this.#trackModeration();
		this.#syncTimers();
	}

	#trackModeration(): void {
		const wasPending = this.#pendingSince !== null;
		if (this.pendingModeration) this.#pendingSince ??= now();
		else this.#pendingSince = null;
		if (wasPending && this.#pendingSince === null && this.post !== null)
			this.#refreshFeed();
		const fresh = rejectionKeys(this.post).filter(
			(key) => !this.#notifiedRejections.includes(key),
		);
		if (fresh.length === 0) return;
		this.#notifiedRejections = [...this.#notifiedRejections, ...fresh];
		toast.error("Your post was rejected", {
			id: REJECTED_TOAST_ID,
			action: { label: "Why?", onClick: () => this.#requestSheet() },
		});
	}

	#ended(previous: RightNowPostDetails): void {
		this.lastPost = previous;
		toast("Your Right Now session ended", {
			id: ENDED_TOAST_ID,
			action: {
				label: "Go again",
				onClick: () => void this.#goAgainAndOpenSheet(),
			},
		});
		this.#refreshFeed();
		this.#refreshAllowance();
	}

	async #goAgainAndOpenSheet(): Promise<void> {
		if (await this.goAgain()) this.#requestSheet();
	}

	#requestSheet(): void {
		for (const listener of this.#sheetListeners) listener();
	}

	#isGone(epoch: number): boolean {
		return this.#destroyed || !isAccountEpochCurrent(epoch);
	}

	#syncTimers(): void {
		const attached = this.#views > 0 && !this.#destroyed;
		this.#syncTicker({ running: attached });
		this.#syncExpiry({
			expiration: attached ? (this.post?.expiration ?? null) : null,
		});
		this.#syncPoll({ running: attached && this.pendingModeration });
	}

	#syncTicker({ running }: { running: boolean }): void {
		if (!running) {
			if (this.#ticker !== null) clearInterval(this.#ticker);
			this.#ticker = null;
			return;
		}
		if (this.#ticker !== null) return;
		this.#clock = now();
		this.#ticker = setInterval(() => {
			this.#clock = now();
		}, TICK_MS);
	}

	#syncExpiry({ expiration }: { expiration: number | null }): void {
		if (expiration === this.#expiryFor) return;
		if (this.#expiryTimer !== null) clearTimeout(this.#expiryTimer);
		this.#expiryTimer = null;
		this.#expiryFor = expiration;
		this.#expiryRechecks = 0;
		if (expiration !== null)
			this.#scheduleExpiryCheck({ delay: expiration - now() });
	}

	#scheduleExpiryCheck({ delay }: { delay: number }): void {
		this.#expiryTimer = setTimeout(
			() => {
				this.#expiryTimer = null;
				void this.#checkExpiry();
			},
			Math.max(0, delay),
		);
	}

	async #checkExpiry(): Promise<void> {
		const expiration = this.#expiryFor;
		if (!document.hidden && appLifecycle.active)
			await this.#refetch({ epoch: accountEpoch() });
		if (
			this.#destroyed ||
			expiration === null ||
			this.#expiryFor !== expiration ||
			this.#expiryTimer !== null
		)
			return;
		const backoff = Math.min(
			SLOW_POLL_MS,
			EXPIRY_RECHECK_MS * 2 ** this.#expiryRechecks,
		);
		this.#expiryRechecks += 1;
		this.#scheduleExpiryCheck({
			delay: Math.max(backoff, expiration - now()),
		});
	}

	#syncPoll({ running }: { running: boolean }): void {
		if (!running) {
			this.#clearPoll();
			return;
		}
		if (this.#pollTimer !== null) return;
		const pendingFor = now() - (this.#pendingSince ?? now());
		this.#pollTimer = setTimeout(
			() => {
				this.#pollTimer = null;
				void this.#pollModeration();
			},
			pendingFor < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS,
		);
	}

	#clearPoll(): void {
		if (this.#pollTimer !== null) clearTimeout(this.#pollTimer);
		this.#pollTimer = null;
	}

	async #pollModeration(): Promise<void> {
		if (!document.hidden && appLifecycle.active)
			await this.#refetch({ epoch: accountEpoch() });
		this.#syncTimers();
	}
}

export const getRightNowPostState = accountScoped(
	(profileId) => new RightNowPostState({ profileId }),
);
