// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import JoinConfirmDialog from "./JoinConfirmDialog.svelte";
import { FakeRightNowPostState } from "./post-test-helpers.svelte";

const joinNowButton = () => screen.getByRole("button", { name: "Join now" });
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const dialogShown = () =>
	screen.queryByRole("alertdialog", { name: "Join Right Now?" }) !== null;

const dismissals = [
	["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
	["the back gesture", () => runBackGestureHandlers()],
] as const;

async function renderDialog() {
	const fake = new FakeRightNowPostState();
	const onjoined = vi.fn();
	render(JoinConfirmDialog, {
		props: { open: true, ownPost: fake.state, onjoined },
	});
	await vi.waitFor(joinNowButton);
	return { fake, onjoined };
}

afterEach(cleanup);

describe("the Join Right Now confirmation", () => {
	it("explains that the post shows as Joined until something is added", async () => {
		await renderDialog();

		expect(
			screen.getByRole("alertdialog", { name: "Join Right Now?" }),
		).toBeTruthy();
		expect(
			screen.getByText(`You'll show as "Joined" until you add a post.`),
		).toBeTruthy();
	});

	it("joins, closes and hands over to the post sheet", async () => {
		const { fake, onjoined } = await renderDialog();

		await fireEvent.click(joinNowButton());

		await vi.waitFor(() => expect(dialogShown()).toBe(false));
		expect(fake.join).toHaveBeenCalledOnce();
		expect(onjoined).toHaveBeenCalledOnce();
	});

	it("closes without opening the sheet when joining fails", async () => {
		const { fake, onjoined } = await renderDialog();
		fake.join.mockResolvedValueOnce(false);

		await fireEvent.click(joinNowButton());

		await vi.waitFor(() => expect(dialogShown()).toBe(false));
		expect(onjoined).not.toHaveBeenCalled();
	});

	it("cancels without joining", async () => {
		const { fake, onjoined } = await renderDialog();

		await fireEvent.click(cancelButton());

		await vi.waitFor(() => expect(dialogShown()).toBe(false));
		expect(fake.join).not.toHaveBeenCalled();
		expect(onjoined).not.toHaveBeenCalled();
	});

	it("marks Join now busy and locks both buttons while joining", async () => {
		const { fake } = await renderDialog();

		fake.joining = true;
		flushSync();

		expect(joinNowButton().getAttribute("aria-busy")).toBe("true");
		expect(joinNowButton().matches(":disabled")).toBe(true);
		expect(cancelButton().matches(":disabled")).toBe(true);
	});

	it.each(dismissals)("closes on %s without joining", async (_, dismiss) => {
		const { fake } = await renderDialog();

		await dismiss();

		await vi.waitFor(() => expect(dialogShown()).toBe(false));
		expect(fake.join).not.toHaveBeenCalled();
	});

	it.each(dismissals)(
		"stays open on %s while joining",
		async (_, dismiss) => {
			const { fake } = await renderDialog();

			fake.joining = true;
			flushSync();
			await dismiss();
			flushSync();

			expect(
				screen
					.getByRole("alertdialog", { name: "Join Right Now?" })
					.getAttribute("data-state"),
			).toBe("open");
		},
	);
});
