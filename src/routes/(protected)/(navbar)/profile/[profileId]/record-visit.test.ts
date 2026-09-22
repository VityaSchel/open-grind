import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordProfileViewMock, getPreferencesMock, showErrorToastMock } =
	vi.hoisted(() => ({
		recordProfileViewMock: vi.fn(),
		getPreferencesMock: vi.fn(),
		showErrorToastMock: vi.fn(),
	}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/views", () => ({
	recordProfileView: recordProfileViewMock,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: getPreferencesMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { forgetProfileVisits, recordProfileVisit } from "./record-visit";

const PROFILE_ID = 100001;
const OUR_ID = 42;

beforeEach(() => {
	vi.clearAllMocks();
	forgetProfileVisits();
	recordProfileViewMock.mockResolvedValue(undefined);
	getPreferencesMock.mockResolvedValue({ revealProfileViews: true });
});

describe("recordProfileVisit", () => {
	it("records a view when the preference is on", async () => {
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("records nothing when the preference is off", async () => {
		getPreferencesMock.mockResolvedValue({ revealProfileViews: false });

		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(getPreferencesMock).toHaveBeenCalledOnce();
		expect(recordProfileViewMock).not.toHaveBeenCalled();
	});

	it("records nothing for a non-numeric profile id", async () => {
		await recordProfileVisit({
			profileId: Number("nobody"),
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).not.toHaveBeenCalled();
	});

	it("records nothing on our own profile", async () => {
		await recordProfileVisit({ profileId: OUR_ID, ourProfileId: OUR_ID });

		expect(recordProfileViewMock).not.toHaveBeenCalled();
	});

	it("toasts instead of rejecting when the view fails to record", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new Error("offline");
		recordProfileViewMock.mockRejectedValueOnce(failure);

		await expect(
			recordProfileVisit({ profileId: PROFILE_ID, ourProfileId: OUR_ID }),
		).resolves.toBeUndefined();

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to record profile view preference or action",
			error: failure,
		});
	});

	it("toasts when the preference cannot be read", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new Error("unreadable");
		getPreferencesMock.mockRejectedValueOnce(failure);

		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).not.toHaveBeenCalled();
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to record profile view preference or action",
			error: failure,
		});
	});

	it("records a profile once however often it is visited", async () => {
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).toHaveBeenCalledOnce();
		expect(getPreferencesMock).toHaveBeenCalledOnce();
	});

	it("records a profile again once its visits are forgotten", async () => {
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		forgetProfileVisits();
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).toHaveBeenCalledTimes(2);
	});

	it("forgets its visits on sign-out", async () => {
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		clearAccountCaches();
		await recordProfileVisit({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
		});

		expect(recordProfileViewMock).toHaveBeenCalledTimes(2);
	});
});
