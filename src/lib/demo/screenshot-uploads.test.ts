import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ screenshots: true }));

vi.mock("$lib/demo/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./config")>();
	return {
		...actual,
		demoEnabled: true,
		get screenshotsEnabled() {
			return flags.screenshots;
		},
	};
});

import { ApiError, httpStatusOf } from "$lib/api/api-error";
import { uploadAlbumContent } from "$lib/api/messaging/albums";
import { loadDemo } from "$lib/demo";
import type { MediaFileInspection } from "$lib/platform/media-file";
import { settlesSoon } from "./demo-test-helpers";
import {
	type NativeError,
	type Pending,
	type ScreenshotScene,
	screenshotScene,
} from "./screenshot-scene";

const ALBUM_ID = 900;
const UPLOAD_PATH = `/v1/albums/${ALBUM_ID}/content`;
const initialScene = structuredClone(screenshotScene);

const photo: MediaFileInspection = { kind: "photo", size: 1 };
const video: MediaFileInspection = {
	kind: "video",
	size: 1,
	width: 240,
	height: 320,
};

function setScene(scene: Partial<ScreenshotScene>): void {
	Object.assign(screenshotScene, scene);
}

function faultUploads(
	fault: { status: number } | { error: NativeError } | Pending,
): void {
	setScene({ restFaults: [{ method: "POST", path: UPLOAD_PATH, ...fault }] });
}

function upload({
	albumId = ALBUM_ID,
	inspection = photo,
}: { albumId?: number; inspection?: MediaFileInspection } = {}) {
	return uploadAlbumContent({
		albumId,
		media: {
			source: "web",
			key: "picked",
			mimeType: "image/jpeg",
			file: new File([], "picked.jpg"),
		},
		inspection,
		limits: { maxContentSize: 1024 },
		profileId: 1,
	});
}

beforeAll(loadDemo);

afterEach(() => {
	Object.assign(screenshotScene, structuredClone(initialScene));
	flags.screenshots = true;
});

describe("album upload faults", () => {
	it("refuses an upload with the scene's status", async () => {
		faultUploads({ status: 402 });
		const error = await upload().catch((failure: unknown) => failure);
		expect(error).toBeInstanceOf(ApiError);
		expect(httpStatusOf(error)).toBe(402);
	});

	it("throws a transport fault as the native error", async () => {
		faultUploads({ error: { kind: "Connect" } });
		await expect(upload()).rejects.toMatchObject({ kind: "Connect" });
	});

	it("matches a video upload, whose path carries its size", async () => {
		faultUploads({ status: 400 });
		const error = await upload({ inspection: video }).catch(
			(failure: unknown) => failure,
		);
		expect(httpStatusOf(error)).toBe(400);
	});

	it("leaves a pending upload unanswered", async () => {
		faultUploads({ pending: true });
		expect(await settlesSoon(upload())).toBe(false);
		expect(await settlesSoon(upload({ albumId: ALBUM_ID + 1 }))).toBe(true);
	});

	it("uploads into the demo album when no fault matches", async () => {
		faultUploads({ status: 402 });
		const uploaded = await upload({ albumId: ALBUM_ID + 1 });
		expect(uploaded.contentId).toBeGreaterThan(0);
		expect(uploaded.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("lets a successful answer through to the demo upload", async () => {
		faultUploads({ status: 200 });
		await expect(upload()).resolves.toMatchObject({
			contentId: expect.any(Number) as number,
		});
	});

	it("ignores faults without the flag", async () => {
		flags.screenshots = false;
		faultUploads({ status: 402 });
		await expect(upload()).resolves.toMatchObject({
			contentId: expect.any(Number) as number,
		});
	});
});
