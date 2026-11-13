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
	| "mapAvailable"
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
	mapAvailable = $state(true);
	loading = $state(false);
	joining = $state(false);
	saving = $state(false);
	timeLeftMs = $state(42 * MINUTE);
	status: RightNowPostState["status"] = $derived.by(() => {
		if (this.post === null) return "none";
		return this.post.postStatus === "HIDDEN" ? "off" : "active";
	});
	rejected = $state.raw<RightNowPostRejection>({
		text: false,
		photo: false,
		reasons: [],
	});
	join = vi.fn<RightNowPostState["join"]>(() => {
		this.post = ownPost();
		return Promise.resolve(true);
	});
	save = vi.fn<RightNowPostState["save"]>(() => Promise.resolve(true));
	setHidden = vi.fn<RightNowPostState["setHidden"]>(() =>
		Promise.resolve(true),
	);
	attachView = vi.fn<RightNowPostState["attachView"]>(() => () => {});

	#sheetListeners: (() => void)[] = [];

	get state(): RightNowPostState {
		return this as unknown as RightNowPostState;
	}

	onSheetRequest(listener: () => void): () => void {
		this.#sheetListeners = [...this.#sheetListeners, listener];
		return () => {
			this.#sheetListeners = this.#sheetListeners.filter(
				(existing) => existing !== listener,
			);
		};
	}

	requestSheet(): void {
		for (const listener of this.#sheetListeners) listener();
	}
}

export function runningPost(
	overrides: Partial<RightNowPostDetails> = {},
): FakeRightNowPostState {
	const fake = new FakeRightNowPostState();
	fake.post = ownPost(overrides);
	return fake;
}
