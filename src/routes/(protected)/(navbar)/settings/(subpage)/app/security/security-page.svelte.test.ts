// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const disguise = vi.hoisted(() => ({ available: false }));

vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("#lib/platform/disguise.svelte.ts", () => ({
	disguiseAvailable: () => disguise.available,
}));

import ToastUnimplemented from "#lib/components/feedback/ToastUnimplemented.svelte";
import SecurityPage from "./+page.svelte";

afterEach(() => {
	cleanup();
	toast.mockReset();
	disguise.available = false;
});

describe("the Security settings", () => {
	it("list the discreet app icon and the PIN under no headings", () => {
		render(SecurityPage);

		expect(
			screen.getAllByRole("link").map((link) => link.textContent.trim()),
		).toEqual(["Discreet App Icon", "PIN"]);
		expect(screen.queryAllByRole("heading")).toEqual([]);
	});

	it.each([
		{
			name: "Discreet App Icon",
			message: "settings.app.discreetAppIcon.unimplemented",
			issue: 97,
		},
		{ name: "PIN", message: "settings.app.pin.unimplemented", issue: 50 },
	])(
		"says $name isn’t built yet and links issue $issue without navigating",
		async ({ name, message, issue }) => {
			render(SecurityPage);

			const followed = await fireEvent.click(
				screen.getByRole("link", { name }),
			);

			expect(followed).toBe(false);
			expect(toast).toHaveBeenCalledExactlyOnceWith(ToastUnimplemented, {
				componentProps: { message, issue },
			});
		},
	);

	it("open the discreet app icon choices where the system can change the icon", () => {
		disguise.available = true;
		render(SecurityPage);

		expect(
			screen
				.getByRole("link", { name: "Discreet App Icon" })
				.getAttribute("href"),
		).toBe("/settings/app/discreet-icon");
	});
});
