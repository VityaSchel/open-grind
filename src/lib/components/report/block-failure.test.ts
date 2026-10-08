import { beforeEach, expect, it, vi } from "vitest";

const { toastErrorMock, showErrorToastMock, openExternalLinkMock } = vi.hoisted(
	() => ({
		toastErrorMock: vi.fn(),
		showErrorToastMock: vi.fn(),
		openExternalLinkMock: vi.fn(),
	}),
);

vi.mock("svelte-sonner", () => ({ toast: { error: toastErrorMock } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/platform/link-opener", () => ({
	openExternalLink: openExternalLinkMock,
}));

import { ApiError } from "$lib/api/api-error";
import { BlockDidNotStickError } from "$lib/api/browse/blocks";
import { showBlockFailure } from "./block-failure";

const WHY_BLOCKING_FAILS =
	"https://opengrind.org/guides/blocking-and-hiding-profiles#why-cant-i-block-some-profiles";

function learnMore() {
	const [, options] = toastErrorMock.mock.lastCall as [
		string,
		{ action: { label: string; onClick: () => void } },
	];
	return options.action;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it("suggests hiding when Grindr does not list the profile as blocked", () => {
	showBlockFailure(new BlockDidNotStickError());

	expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
		"Blocking this profile failed. Try hiding instead.",
		expect.anything(),
	);
	expect(showErrorToastMock).not.toHaveBeenCalled();
	const action = learnMore();
	expect(action.label).toBe("Learn more");
	action.onClick();
	expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
		WHY_BLOCKING_FAILS,
	);
});

it.each([
	new ApiError({
		message: "API request failed with status 403",
		request: { method: "POST", path: "/v3/me/blocks/100010" },
		response: { status: 403, body: "" },
	}),
	new Error("offline"),
])("reports any other failure as a failed block", (error) => {
	showBlockFailure(error);

	expect(toastErrorMock).not.toHaveBeenCalled();
	expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
		label: "Failed to block user",
		error,
	});
});
