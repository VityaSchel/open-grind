import { vi } from "vitest";

import type { RightNowPostDetails } from "#lib/model/right-now/post.ts";
import type {
	RightNowPostRejection,
	RightNowPostState,
} from "../right-now-post-state.svelte";
import { MINUTE, ownPost } from "../right-now-post-test-helpers";

export class FakeRightNowPostState implements Pick<
	RightNowPostState,
	| "post"
	| "freePostsLeft"
	| "loading"
	| "joining"
	| "saving"
	| "timeLeftMs"
	| "status"
	| "rejected"
	| "join"
	| "save"
	| "setHidden"
	| "onSheetRequest"
	| "attachView"
> {
	post = $state.raw<RightNowPostState["post"]>(null);
	freePostsLeft = $state<RightNowPostState["freePostsLeft"]>(3);
	loading = $state(false);
	joining = $state(false);
	saving = $state(false);
	timeLeftMs = $state(42 * MINUTE);
	status = $state<RightNowPostState["status"]>("none");
	rejected = $state.raw<RightNowPostRejection>({
		text: false,
		photo: false,
		reasons: [],
	});
	join = vi.fn<RightNowPostState["join"]>(() => Promise.resolve(true));
	save = vi.fn<RightNowPostState["save"]>(() => Promise.resolve(true));
	setHidden = vi.fn<RightNowPostState["setHidden"]>(() =>
		Promise.resolve(true),
	);
	onSheetRequest = vi.fn<RightNowPostState["onSheetRequest"]>(() => () => {});
	attachView = vi.fn<RightNowPostState["attachView"]>(() => () => {});

	get state(): RightNowPostState {
		return this as unknown as RightNowPostState;
	}

	startPost(overrides: Partial<RightNowPostDetails> = {}): void {
		this.post = ownPost(overrides);
		this.status = this.post.postStatus === "HIDDEN" ? "off" : "active";
	}
}

export function runningPost(
	overrides: Partial<RightNowPostDetails> = {},
): FakeRightNowPostState {
	const fake = new FakeRightNowPostState();
	fake.startPost(overrides);
	return fake;
}
