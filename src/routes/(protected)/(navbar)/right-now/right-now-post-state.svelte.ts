import { untrack } from "svelte";
import { toast } from "svelte-sonner";
import { createSubscriber } from "svelte/reactivity";

import {
	accountEpoch,
	accountScoped,
	isAccountEpochCurrent,
} from "#lib/api/account-caches.ts";
import { isAssignmentOn } from "#lib/api/analytics/assignments.ts";
import { appLifecycle } from "#lib/api/app-lifecycle.svelte.ts";
import { getRightNowPostEntitlements } from "#lib/api/browse/entitlements.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	createRightNowPost,
	getActiveRightNowPost,
	NoFreeRightNowPostsError,
	RightNowPostAlreadyRunningError,
	RightNowSessionEndedError,
	setRightNowPostHidden,
	updateRightNowPost,
} from "#lib/api/right-now/post.ts";
import { invalidateProfile } from "#lib/api/users/profiles.ts";
import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request-state.svelte.ts";
import {
	type FreeRightNowPosts,
	freeRightNowPostsLeft,
} from "#lib/model/browse/entitlements.ts";
import { now } from "#lib/util/clock.ts";
import { Generation } from "#lib/util/generation.ts";
import { reconciler } from "#lib/util/reconcile.ts";
import type {
	RightNowPostChanges,
	RightNowPostDetails,
	RightNowPostRequest,
} from "#lib/model/right-now/post.ts";
import { getRightNowFeedState } from "./right-now-feed-state.svelte";
import {
	isAwaitingModeration,
	isLivePost,
	rejectedParts,
	rejectionKeys,
	repostRequest,
	textRejectReasonLabel,
} from "./right-now-post-fields";
import { atStoredLocation } from "./stored-location";

const SECOND = 1_000;
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

export class RightNowPostState {
	post: RightNowPostDetails | null = $state.raw(null);
	freePostsLeft: FreeRightNowPosts = $state(null);
	mapAvailable = $state(false);
	loading = $state(true);
	joining = $state(false);
	saving = $state(false);

	readonly #secondTick = createSubscriber((update) => {
		const interval = setInterval(update, SECOND);
		return () => clearInterval(interval);
	});

	get timeLeftMs(): number {
		const expiration = this.post?.expiration ?? null;
		if (expiration === null) return 0;
		this.#secondTick();
		return Math.max(0, expiration - now());
	}

	status: "off" | "active" | "none" = $derived.by(() => {
		if (this.post === null) return "none";
		return this.post.postStatus === "HIDDEN" ? "off" : "active";
	});

	pendingModeration: boolean = $derived(
		this.post !== null && isAwaitingModeration(this.post),
	);

	rejected: RightNowPostRejection = $derived.by(() => {
		const { text, photos } = rejectedParts(this.post);
		const reasons = [
			...(text?.rejectReasons ?? []).map((reason) =>
				textRejectReasonLabel({ reason }),
			),
			...photos.flatMap(({ reason }) =>
				reason === null ? [] : [reason],
			),
		];
		return {
			text: text !== null,
			photo: photos.length > 0,
			reasons: reasons.filter(
				(reason, index) => reasons.indexOf(reason) === index,
			),
		};
	});

	readonly #profileId: number;
	readonly #postReads = new Generation();
	readonly #allowanceReads = new Generation();
	readonly #mapReads = new Generation();
	#views = 0;
	#viewLeft = false;
	#loaded = false;
	#destroyed = false;
	readonly #epoch = accountEpoch();
	#loadInFlight: Promise<void> | null = null;
	#pendingSince: number | null = null;
	#notifiedRejections: string[] = [];
	#followedGeohash: string | null = null;
	#pollTimer: ReturnType<typeof setTimeout> | null = null;
	#expiryTimer: ReturnType<typeof setTimeout> | null = null;
	#expiryFor: number | null = null;
	#expiryRechecks = 0;
	readonly #unsubscribeReconcile = reconciler.subscribe(async () => {
		if (this.#views > 0 && !document.hidden && appLifecycle.active)
			await this.load();
	});

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
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
		});
	}

	save({ changes }: { changes: RightNowPostChanges }): Promise<boolean> {
		return this.#editPost({
			unchanged: () => Object.keys(changes).length === 0,
			send: async (postId) => {
				await updateRightNowPost({ postId, changes });
				if (changes.text !== undefined || changes.media !== undefined) {
					this.#pendingSince = null;
					this.#clearPoll();
				}
			},
			merge: (current) => ({
				...current,
				hosting: changes.hosting ?? current.hosting,
				shareLocation: changes.shareLocation ?? current.shareLocation,
				locationRadius:
					changes.locationRadius ?? current.locationRadius,
			}),
			failureLabel: "Failed to save your post",
		});
	}

	setHidden({ hidden }: { hidden: boolean }): Promise<boolean> {
		return this.#editPost({
			unchanged: (post) => (post.postStatus === "HIDDEN") === hidden,
			send: (postId) => setRightNowPostHidden({ postId, hidden }),
			merge: (current) => ({
				...current,
				postStatus: hidden ? "HIDDEN" : "ACTIVE",
			}),
			failureLabel: hidden
				? "Failed to turn off Right Now"
				: "Failed to turn on Right Now",
			onRetry: () => void this.setHidden({ hidden }),
		});
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

	followLocation(geohash: string): void {
		const previous = this.#followedGeohash;
		this.#followedGeohash = geohash;
		if (previous === null || previous === geohash) return;
		untrack(() => {
			this.#refreshMapAvailability();
			if (this.post === null) this.#refreshAllowance();
		});
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unsubscribeReconcile();
		this.#syncTimers();
	}

	async #load(): Promise<void> {
		if (!this.#loaded) this.loading = true;
		this.#refreshMapAvailability();
		try {
			await Promise.all([this.#readPost(), this.#readAllowance()]);
			if (this.#gone) return;
			this.#loaded = true;
		} catch (error) {
			if (this.#gone) return;
			console.error(error);
		} finally {
			if (!this.#gone) this.loading = false;
		}
	}

	async #create({
		request,
		failureLabel,
	}: {
		request: RightNowPostRequest;
		failureLabel: string;
	}): Promise<boolean> {
		if (this.#destroyed || this.joining || this.post !== null) return false;
		this.joining = true;
		try {
			const created = await atStoredLocation({
				epoch: this.#epoch,
				request: () => createRightNowPost({ post: request }),
			});
			if (this.#gone) return false;
			this.#postReads.next();
			if (typeof this.freePostsLeft === "number")
				this.freePostsLeft = Math.max(0, this.freePostsLeft - 1);
			this.#applyPost(created);
			this.#ownPostChanged();
			return true;
		} catch (error) {
			if (this.#gone) return false;
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
				await this.#refetch();
				return false;
			}
			console.error(error);
			showErrorToast({
				label: failureLabel,
				error,
				onRetry: () =>
					void this.#createAndOpenSheet({ request, failureLabel }),
			});
			return false;
		} finally {
			this.joining = false;
		}
	}

	async #editPost({
		unchanged,
		send,
		merge,
		failureLabel,
		onRetry,
	}: {
		unchanged: (post: RightNowPostDetails) => boolean;
		send: (postId: number) => Promise<void>;
		merge: (post: RightNowPostDetails) => RightNowPostDetails;
		failureLabel: string;
		onRetry?: () => void;
	}): Promise<boolean> {
		const post = this.post;
		if (this.#destroyed || post === null || this.saving) return false;
		if (unchanged(post)) return true;
		this.saving = true;
		try {
			await send(post.id);
			if (this.#gone) return false;
			this.#mergeIntoPost({ postId: post.id, merge });
			this.#ownPostChanged();
			await this.#refetch();
			return true;
		} catch (error) {
			if (this.#gone) return false;
			if (error instanceof RightNowSessionEndedError) {
				await this.#refetch();
				return false;
			}
			console.error(error);
			showErrorToast({ label: failureLabel, error, onRetry });
			return false;
		} finally {
			this.saving = false;
		}
	}

	async #readPost(): Promise<void> {
		const read = this.#postReads.next();
		const post = await getActiveRightNowPost();
		if (this.#gone || this.#postReads.isStale(read)) return;
		this.#applyPost(post);
	}

	async #readAllowance(): Promise<void> {
		const read = this.#allowanceReads.next();
		const entitlements = await atStoredLocation({
			epoch: this.#epoch,
			request: getRightNowPostEntitlements,
		});
		if (this.#gone || this.#allowanceReads.isStale(read)) return;
		this.freePostsLeft = freeRightNowPostsLeft(entitlements);
	}

	async #refetch(): Promise<void> {
		try {
			await this.#readPost();
		} catch (error) {
			if (!this.#gone) console.error(error);
		}
	}

	#refreshAllowance(): void {
		void this.#readAllowance().catch((error: unknown) => {
			if (!this.#gone) console.error(error);
		});
	}

	#refreshMapAvailability(): void {
		const read = this.#mapReads.next();
		void isAssignmentOn({ key: "right-now-map" }).then((available) => {
			if (this.#gone || this.#mapReads.isStale(read)) return;
			this.mapAvailable = available;
		});
	}

	#ownPostChanged(): void {
		invalidateProfile(this.#profileId);
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
		if (previous !== null && post === null) this.#ended(previous);
		this.#trackModeration();
		this.#syncTimers();
	}

	#trackModeration(): void {
		const wasPending = this.#pendingSince !== null;
		if (this.pendingModeration) this.#pendingSince ??= now();
		else this.#pendingSince = null;
		if (wasPending && this.#pendingSince === null && this.post !== null)
			this.#ownPostChanged();
		const fresh = rejectionKeys(this.post).filter(
			(key) => !this.#notifiedRejections.includes(key),
		);
		if (fresh.length === 0) return;
		this.#notifiedRejections = [...this.#notifiedRejections, ...fresh];
		toast.error("Your post was rejected", {
			id: REJECTED_TOAST_ID,
			action: { label: "Why?", onClick: () => this.#openSheet() },
		});
	}

	#ended(previous: RightNowPostDetails): void {
		toast("Your Right Now session ended", {
			id: ENDED_TOAST_ID,
			action: {
				label: "Go again",
				onClick: () =>
					void this.#createAndOpenSheet({
						request: repostRequest(previous),
						failureLabel: "Failed to start a new Right Now session",
					}),
			},
		});
		this.#ownPostChanged();
		if (this.#loadInFlight === null) this.#refreshAllowance();
	}

	async #createAndOpenSheet({
		request,
		failureLabel,
	}: {
		request: RightNowPostRequest;
		failureLabel: string;
	}): Promise<void> {
		if (await this.#create({ request, failureLabel })) this.#openSheet();
	}

	#openSheet(): void {
		if (!this.#gone) rightNowPostSheetRequest.request();
	}

	get #gone(): boolean {
		return this.#destroyed || !isAccountEpochCurrent(this.#epoch);
	}

	#syncTimers(): void {
		const attached = this.#views > 0 && !this.#destroyed;
		this.#syncExpiry({
			expiration: attached ? (this.post?.expiration ?? null) : null,
		});
		this.#syncPoll({ running: attached && this.pendingModeration });
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
		if (!document.hidden && appLifecycle.active) await this.#refetch();
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
		if (!document.hidden && appLifecycle.active) await this.#refetch();
		this.#syncTimers();
	}
}

export const getRightNowPostState = accountScoped(
	(profileId) => new RightNowPostState({ profileId }),
);
