// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { conversationIdFor } from "#lib/chat/conversation-id.ts";
import type { PostData } from "#lib/model/right-now/feed.ts";
import { photo, postData } from "./feed-post-test-helpers";
import RightNowPostCard from "./RightNowPostCard.svelte";

const OUR_PROFILE_ID = 100;
const AUTHOR_ID = 200;

function renderCard({
	overrides = {},
	ourProfileId = OUR_PROFILE_ID,
	underReview = false,
	onedit = vi.fn(),
}: {
	overrides?: Partial<PostData>;
	ourProfileId?: number;
	underReview?: boolean;
	onedit?: (() => void) | null;
} = {}) {
	return render(RightNowPostCard, {
		props: {
			post: postData({
				profileId: AUTHOR_ID,
				displayName: "Simon",
				...overrides,
			}),
			ourProfileId,
			underReview,
			onedit,
		},
	});
}

afterEach(cleanup);

describe("a Right Now post card", () => {
	it("heads the post with its text and names the article after it", () => {
		renderCard({ overrides: { text: "Coffee at mine?" } });

		expect(
			screen.getByRole("heading", { name: "Coffee at mine?" }),
		).toBeTruthy();
		expect(
			screen.getByRole("article", { name: "Coffee at mine?" }),
		).toBeTruthy();
		expect(screen.queryByText("Simon joined")).toBeNull();
	});

	it("announces that the author joined when the post has no text", () => {
		renderCard();

		expect(
			screen.getByRole("heading", { name: "Simon joined" }),
		).toBeTruthy();
	});

	it("falls back to a nameless headline and labels for an unnamed author", () => {
		renderCard({ overrides: { displayName: undefined } });

		expect(screen.getByRole("heading", { name: "Joined" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "View profile" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Message" })).toBeTruthy();
	});

	it("links the avatar to the author's profile", () => {
		renderCard();

		expect(
			screen
				.getByRole("link", { name: "View Simon's profile" })
				.getAttribute("href"),
		).toBe(`/profile/${AUTHOR_ID}`);
	});

	it("shows the online dot only while the author is online", () => {
		renderCard({ overrides: { onlineUntil: Date.now() + 60_000 } });
		expect(screen.getByTitle("Online now")).toBeTruthy();
		cleanup();

		renderCard({ overrides: { onlineUntil: Date.now() - 60_000 } });
		expect(screen.queryByTitle("Online now")).toBeNull();
	});

	it("renders only the first photo", async () => {
		const first = photo(1);
		renderCard({ overrides: { media: [first, photo(2)] } });

		const images = screen.getAllByRole("img", { name: "Post photo" });
		expect(images).toHaveLength(1);
		await vi.waitFor(() =>
			expect(images[0]?.getAttribute("src")).toBe(
				first.data.thumbnailUrl,
			),
		);
	});

	it.each([
		{ isNsfw: true, shouldBlur: true, blurred: true },
		{ isNsfw: true, shouldBlur: false, blurred: false },
		{ isNsfw: false, shouldBlur: true, blurred: false },
	])(
		"blurs the photo only when the server marks it as nudity to blur ($isNsfw, $shouldBlur)",
		({ isNsfw, shouldBlur, blurred }) => {
			const media = photo(1);
			renderCard({
				overrides: {
					media: [
						{
							...media,
							data: { ...media.data, isNsfw, shouldBlur },
						},
					],
				},
			});

			expect(screen.queryByText("May contain nudity") !== null).toBe(
				blurred,
			);
		},
	);

	it("renders no photo when the post has none", () => {
		renderCard();

		expect(screen.queryByRole("img", { name: "Post photo" })).toBeNull();
	});

	it("links the chat button to the conversation with the author", () => {
		renderCard();

		const conversationId = conversationIdFor({
			profileId: AUTHOR_ID,
			ourProfileId: OUR_PROFILE_ID,
		});
		expect(
			screen
				.getByRole("link", { name: "Message Simon" })
				.getAttribute("href"),
		).toBe(`/chat/${conversationId}`);
	});

	it("leaves the chat button off our own post", () => {
		renderCard({ ourProfileId: AUTHOR_ID });

		expect(
			screen.getByRole("link", { name: "View Simon's profile" }),
		).toBeTruthy();
		expect(screen.queryByRole("link", { name: /^Message/ })).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(1);
	});

	it("offers Edit instead of Message on our own post", async () => {
		const onedit = vi.fn();
		renderCard({ ourProfileId: AUTHOR_ID, onedit });

		await fireEvent.click(
			screen.getByRole("button", { name: "Edit your post" }),
		);

		expect(onedit).toHaveBeenCalledOnce();
		expect(screen.queryByRole("link", { name: /^Message/ })).toBeNull();
	});

	it("offers neither Edit nor Message on our own post until our post is loaded", () => {
		renderCard({ ourProfileId: AUTHOR_ID, onedit: null });

		expect(
			screen.queryByRole("button", { name: "Edit your post" }),
		).toBeNull();
		expect(screen.queryByRole("link", { name: /^Message/ })).toBeNull();
	});

	it("offers no Edit button on someone else's post", () => {
		renderCard();

		expect(
			screen.queryByRole("button", { name: "Edit your post" }),
		).toBeNull();
	});

	it("shows Under review on our own post only while moderation is pending", () => {
		const { container } = renderCard({
			ourProfileId: AUTHOR_ID,
			underReview: true,
		});
		expect(
			container.querySelector('[data-slot="right-now-post-review"]')
				?.textContent,
		).toContain("Under review");
		cleanup();

		renderCard({ ourProfileId: AUTHOR_ID });
		expect(screen.queryByText("Under review")).toBeNull();
		cleanup();

		renderCard({ underReview: true });
		expect(screen.queryByText("Under review")).toBeNull();
	});

	it("marks hosting posts only", () => {
		renderCard({ overrides: { hosting: true } });
		expect(screen.getByText("Hosting")).toBeTruthy();
		cleanup();

		renderCard({ overrides: { hosting: false } });
		expect(screen.queryByText("Hosting")).toBeNull();
	});

	it("shows the distance only when the post carries one", () => {
		renderCard({ overrides: { distance: 245 } });
		expect(screen.getByText("245 m")).toBeTruthy();
		cleanup();

		const { container } = renderCard();
		expect(
			container.querySelector('[data-slot="right-now-post-distance"]'),
		).toBeNull();
	});

	it("shows how long ago the post went up", () => {
		const posted = Date.now() - 5 * 60_000 - 30_000;
		renderCard({ overrides: { posted } });

		expect(
			screen
				.getByText("5 mins")
				.closest("time")
				?.getAttribute("datetime"),
		).toBe(new Date(posted).toISOString());
	});
});
