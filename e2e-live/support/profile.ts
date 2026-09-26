import z from "zod";
import type { Page } from "@playwright/test";

import { liveAccounts } from "./accounts";
import { appRequest } from "./app";

const ownProfileSchema = z.object({
	profiles: z.tuple([
		z.object({ aboutMe: z.string().nullish(), showDistance: z.boolean() }),
	]),
});

export class ProfileRestoreError extends Error {
	override name = "ProfileRestoreError";
}

export async function ownProfile(page: Page) {
	const response = await appRequest({
		page,
		method: "GET",
		path: `/v7/profiles/${liveAccounts.app}`,
	});
	return ownProfileSchema.parse(response.json()).profiles[0];
}

export async function setShowDistance({
	page,
	showDistance,
}: {
	page: Page;
	showDistance: boolean;
}) {
	const { status } = await appRequest({
		page,
		method: "PATCH",
		path: "/v4/me/profile",
		body: { showDistance },
		target: liveAccounts.app,
	});
	if (status >= 300) {
		throw new ProfileRestoreError(
			`Restoring Show my distance answered ${status}`,
		);
	}
}
