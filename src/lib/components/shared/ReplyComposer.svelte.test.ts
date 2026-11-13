import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	IOS_INSETS,
	IOS_KEYBOARD_SHOWN,
} from "#lib/platform/native-insets-test-helpers.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import ReplyComposer from "./ReplyComposer.svelte";

describe("ReplyComposer send button on ios", () => {
	beforeEach(() => runningOn("ios"));

	afterEach(() => {
		cleanup();
		delete window.__iosInsets;
		resetPlatform();
	});

	for (const { ime, held } of [
		{ ime: true, held: true },
		{ ime: false, held: false },
	]) {
		it(`${held ? "holds" : "lets go of"} the reply field focus on the tap's mouse press while the keyboard is ${ime ? "up" : "down"}`, async () => {
			window.__iosInsets = ime ? IOS_KEYBOARD_SHOWN : IOS_INSETS;
			const { component } = render(ReplyComposer, {
				props: {
					label: "Reply to album item",
					allowReply: true,
					allowReaction: false,
					onsubmit: () => {},
				},
			});
			flushSync(() => component.update({ enabled: true }));
			await fireEvent.input(
				screen.getByRole("textbox", { name: "Reply to album item" }),
				{ target: { value: "see you soon" } },
			);
			const press = new MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
			});

			screen
				.getByRole("button", { name: "Send reply" })
				.dispatchEvent(press);

			expect(press.defaultPrevented).toBe(held);
		});
	}
});
