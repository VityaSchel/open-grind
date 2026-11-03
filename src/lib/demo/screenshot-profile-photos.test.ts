import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, httpStatusOf } from "$lib/api/api-error";
import { uploadProfilePhoto } from "$lib/api/users/profiles";
import type { PickedMedia } from "$lib/platform/media-picker";
import { settlesSoon } from "./demo-test-helpers";
import {
	type NativeError,
	type Pending,
	type ScreenshotScene,
	screenshotScene,
} from "./screenshot-scene";

type UploadAnswer =
	| { status: number; body?: unknown }
	| { error: NativeError }
	| Pending;

const UPLOAD_PATH = "/v4/media/upload";
const UPLOADED_HASH = "c".repeat(40);
const initialScene = structuredClone(screenshotScene);

const picked: PickedMedia = {
	source: "web",
	key: "picked",
	mimeType: "image/jpeg",
	file: new File([], "picked.jpg"),
};

function faultUploads(fault: UploadAnswer): void {
	const scene: Partial<ScreenshotScene> = {
		restFaults: [{ method: "POST", path: UPLOAD_PATH, ...fault }],
	};
	Object.assign(screenshotScene, scene);
}

function answered(state: string): UploadAnswer {
	return {
		status: 200,
		body: { imageSizes: [{ mediaHash: UPLOADED_HASH, state }] },
	};
}

beforeEach(() => {
	vi.stubGlobal("__DEMO__", true);
	vi.stubGlobal("__SCREENSHOTS__", true);
});

afterEach(() => {
	Object.assign(screenshotScene, structuredClone(initialScene));
	vi.unstubAllGlobals();
});

describe("profile photo upload faults", () => {
	it("uploads the photo the scene answers with", async () => {
		faultUploads(answered("Pending"));
		await expect(uploadProfilePhoto(picked)).resolves.toEqual({
			mediaHash: UPLOADED_HASH,
			pending: true,
		});
	});

	it("reads a reviewed answer as no longer awaiting review", async () => {
		faultUploads(answered("Approved"));
		await expect(uploadProfilePhoto(picked)).resolves.toMatchObject({
			pending: false,
		});
	});

	it("refuses an upload with the scene's status", async () => {
		faultUploads({ status: 403 });
		const error = await uploadProfilePhoto(picked).catch(
			(failure: unknown) => failure,
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(httpStatusOf(error)).toBe(403);
	});

	it("throws a transport fault as the native error", async () => {
		faultUploads({ error: { kind: "Connect" } });
		await expect(uploadProfilePhoto(picked)).rejects.toMatchObject({
			kind: "Connect",
		});
	});

	it("leaves a pending upload unanswered", async () => {
		faultUploads({ pending: true });
		expect(await settlesSoon(uploadProfilePhoto(picked))).toBe(false);
	});

	it("fails the upload when no fault answers it", async () => {
		await expect(uploadProfilePhoto(picked)).rejects.toThrow(
			"Profile photos can't be uploaded in the demo",
		);
	});

	it("ignores faults without the flag", async () => {
		vi.stubGlobal("__SCREENSHOTS__", false);
		faultUploads(answered("Pending"));
		await expect(uploadProfilePhoto(picked)).rejects.toThrow(
			"Profile photos can't be uploaded in the demo",
		);
	});
});
