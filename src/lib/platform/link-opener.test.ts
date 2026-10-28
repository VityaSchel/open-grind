import { afterEach, expect, it, vi } from "vitest";

import { openExternalLink } from "./link-opener";

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

it.each([
	"https://opengrind.org/",
	"http://opengrind.org/",
	"geo:51.507456,-0.127812?q=51.507456,-0.127812",
])("opens %s with the system handler", async (url) => {
	openExternalLink(url);
	await vi.waitFor(() =>
		expect(openUrl).toHaveBeenCalledExactlyOnceWith(url),
	);
});

it.each(["javascript:alert(1)", "file:///etc/passwd"])(
	"blocks unsupported scheme in %s",
	(url) => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		openExternalLink(url);
		expect(openUrl).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledExactlyOnceWith(
			`Blocked navigation to URL with unsupported scheme: ${new URL(url).protocol}`,
		);
	},
);
