import { vi } from "vitest";

import type {
	RightNowPostChanges,
	RightNowPostDetails,
} from "#lib/model/right-now/post.ts";
import type { RightNowPostState } from "../right-now-post-state.svelte";
import { ownPost } from "../right-now-post-test-helpers";

export const MINUTE = 60_000;
export const POST_LIFETIME = 60 * MINUTE;

export function postDetails(
	overrides: Partial<RightNowPostDetails> = {},
): RightNowPostDetails {
	const posted = Date.now() - 18 * MINUTE;
	return ownPost({
		id: 7,
		profileId: 100,
		posted,
		expiration: posted + POST_LIFETIME,
		...overrides,
	});
}

export class FakeRightNowPostState {
	post = $state.raw<RightNowPostDetails | null>(null);
	freePostsLeft = $state<number | "unlimited" | null>(3);
	loading = $state(false);
	error = $state<unknown>(null);
	joining = $state(false);
	saving = $state(false);
	timeLeftMs = $state(42 * MINUTE);
	status = $state<"off" | "active" | "none">("none");
	pendingModeration = $state(false);
	rejected = $state.raw<{ text: boolean; photo: boolean; reasons: string[] }>(
		{ text: false, photo: false, reasons: [] },
	);
	lastPost = $state.raw<RightNowPostDetails | null>(null);
	load = vi.fn<() => Promise<void>>(() => Promise.resolve());
	join = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
	goAgain = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
	save = vi.fn<(args: { changes: RightNowPostChanges }) => Promise<boolean>>(
		() => Promise.resolve(true),
	);
	setHidden = vi.fn<(args: { hidden: boolean }) => Promise<boolean>>(() =>
		Promise.resolve(true),
	);
	onSheetRequest = vi.fn<(listener: () => void) => () => void>(
		() => () => {},
	);
	attachView = vi.fn<() => () => void>(() => () => {});
	destroy = vi.fn<() => void>();

	get state(): RightNowPostState {
		return this as unknown as RightNowPostState;
	}

	startPost(overrides: Partial<RightNowPostDetails> = {}): void {
		this.post = postDetails(overrides);
		this.status = this.post.postStatus === "HIDDEN" ? "off" : "active";
		this.freePostsLeft = 2;
	}
}
