// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MINUTE } from "../right-now-post-test-helpers";
import JoinButton from "./JoinButton.svelte";
import { FakeRightNowPostState, runningPost } from "./post-test-helpers.svelte";

function renderButton(fake = new FakeRightNowPostState()) {
	const onjoin = vi.fn();
	const onopen = vi.fn();
	render(JoinButton, { props: { post: fake.state, onjoin, onopen } });
	return { fake, onjoin, onopen };
}

function ringElapsed(): number {
	const progress = document.querySelector(
		"[data-slot=join-button-ring-progress]",
	);
	return (
		Number(progress?.getAttribute("stroke-dashoffset")) /
		Number(progress?.getAttribute("stroke-dasharray"))
	);
}

afterEach(cleanup);

describe("the Right Now join pill", () => {
	it.each<[FakeRightNowPostState["freePostsLeft"], string]>([
		[3, "Join · 3 free"],
		[1, "Join · 1 free"],
		["unlimited", "Join · Free"],
		[null, "Join"],
	])("with %s free posts reads %s and asks to join", async (free, label) => {
		const fake = new FakeRightNowPostState();
		fake.freePostsLeft = free;
		const { onjoin, onopen } = renderButton(fake);

		const button = screen.getByRole("button", { name: label });
		await fireEvent.click(button);

		expect(onjoin).toHaveBeenCalledOnce();
		expect(onopen).not.toHaveBeenCalled();
	});

	it("is disabled with an explanation when no free posts are left", () => {
		const fake = new FakeRightNowPostState();
		fake.freePostsLeft = 0;
		renderButton(fake);

		const button = screen.getByRole("button", {
			name: "Join · 0 free. No free posts left in this area",
		});

		expect(button.textContent.trim()).toBe("Join · 0 free");
		expect(button.matches(":disabled")).toBe(true);
	});

	it("is disabled while joining", () => {
		const fake = new FakeRightNowPostState();
		fake.joining = true;
		renderButton(fake);

		expect(
			screen
				.getByRole("button", { name: "Join · 3 free" })
				.matches(":disabled"),
		).toBe(true);
	});

	it("stays hidden until the first load tells whether a post runs", () => {
		const fake = new FakeRightNowPostState();
		fake.freePostsLeft = null;
		fake.loading = true;
		renderButton(fake);

		expect(screen.queryByRole("button")).toBeNull();

		fake.loading = false;
		fake.startPost();
		flushSync();

		expect(
			screen.getByRole("button", {
				name: "Your Right Now post, 42m left",
			}),
		).toBeTruthy();
	});

	it("shows the time left with a ring and opens the post during a post", async () => {
		const { onjoin, onopen } = renderButton(runningPost());

		const button = screen.getByRole("button", {
			name: "Your Right Now post, 42m left",
		});
		await fireEvent.click(button);

		expect(button.textContent.trim()).toBe("42m left");
		expect(ringElapsed()).toBeCloseTo(0.3);
		expect(onopen).toHaveBeenCalledOnce();
		expect(onjoin).not.toHaveBeenCalled();
	});

	it("counts down as the time left changes", () => {
		const { fake } = renderButton(runningPost());

		fake.timeLeftMs = 30_000;
		flushSync();

		expect(
			screen.getByRole("button", {
				name: "Your Right Now post, 30s left",
			}),
		).toBeTruthy();
		expect(ringElapsed()).toBeCloseTo(1 - 0.5 / 60);
	});

	it("measures the ring against a full hour when the post has no posted time", () => {
		const fake = runningPost({ posted: null });
		fake.timeLeftMs = 15 * MINUTE;
		renderButton(fake);

		expect(ringElapsed()).toBeCloseTo(0.75);
	});

	it("says the post is off while it is hidden", () => {
		renderButton(runningPost({ postStatus: "HIDDEN" }));

		expect(
			screen.getByRole("button", {
				name: "Your Right Now post, off, 42m left",
			}),
		).toBeTruthy();
	});

	it("goes back to joining once the post ends", () => {
		const { fake } = renderButton(runningPost());

		fake.post = null;
		fake.status = "none";
		fake.freePostsLeft = 2;
		flushSync();

		expect(
			screen.getByRole("button", { name: "Join · 2 free" }),
		).toBeTruthy();
	});
});
