import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { ApiError } from "#lib/api/api-error.ts";
import {
	RightNowPhotoTooSmallError,
	uploadRightNowPhotoFromUrl,
	uploadRightNowPickedPhoto,
} from "#lib/api/right-now/photo.ts";
import { toBase64 } from "#lib/util/base64.ts";
import type { PickedMedia } from "#lib/platform/media-picker.ts";

const UPLOAD_PATH = "/v2/media/upload";

const uploaded = {
	mediaId: 32_205_528,
	thumbnailUrl: "https://cdns.grindr.com/images/thumb/480x480/c1f1",
	url: "https://cdns.grindr.com/images/profile/1024x1024/c1f1",
};

const drawerUrl =
	"https://d3lyqctnm3b6pb.cloudfront.net/chat/photo.jpg?Expires=1&Signature=S";

const desktopPick = {
	source: "desktop",
	key: "pick-1",
	mimeType: "image/jpeg",
	path: "/tmp/photo.jpg",
} satisfies PickedMedia;

function encoded({ status, body }: { status: number; body: unknown }) {
	return toBase64(
		encode({
			status,
			body: new TextEncoder().encode(JSON.stringify(body)),
		}),
	);
}

function backend({
	status = 200,
	body = uploaded,
}: { status?: number; body?: unknown } = {}) {
	invokeMock.mockImplementation((command: string) => {
		switch (command) {
			case "upload_media":
				return Promise.resolve(encoded({ status, body }));
			case "stage_proxied_photo":
				return Promise.resolve("staged-drawer-photo");
		}
		return Promise.reject(new Error(`unexpected command ${command}`));
	});
}

function uploadArgs() {
	return invokeMock.mock.calls.find(
		([command]) => command === "upload_media",
	)?.[1];
}

function commandsSent() {
	return invokeMock.mock.calls.map(([command]) => command);
}

beforeEach(() => {
	invokeMock.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("uploadRightNowPickedPhoto", () => {
	it("uploads the picked photo unsigned with a whole-image crop and returns the new media", async () => {
		backend();

		await expect(
			uploadRightNowPickedPhoto({ media: desktopPick }),
		).resolves.toEqual(uploaded);

		expect(uploadArgs()).toEqual({
			path: UPLOAD_PATH,
			signed: false,
			file: { source: "desktop", path: "/tmp/photo.jpg" },
			crop: "cropAndThumb",
		});
	});

	it("hands an Android pick to the backend as its content URI", async () => {
		backend();
		const uri = {
			uri: "content://media/picker/0/1",
			documentTopTreeUri: null,
		};

		await uploadRightNowPickedPhoto({
			media: { source: "android", key: "pick-2", mimeType: null, uri },
		});

		expect(uploadArgs()).toMatchObject({
			file: { source: "android", uri },
		});
	});

	it("names a photo the server finds too small", async () => {
		backend({
			status: 400,
			body: {
				type: "urn:gr:err:bad_request",
				title: "Invalid request",
				detail: "Bytes too few",
			},
		});

		const upload = uploadRightNowPickedPhoto({ media: desktopPick });

		await expect(upload).rejects.toBeInstanceOf(RightNowPhotoTooSmallError);
		await expect(upload).rejects.toThrow("This photo is too small");
	});

	it("leaves any other refusal as the API error it is", async () => {
		backend({
			status: 400,
			body: { type: "urn:gr:err:bad_request", title: "Invalid request" },
		});

		await expect(
			uploadRightNowPickedPhoto({ media: desktopPick }),
		).rejects.toBeInstanceOf(ApiError);
	});

	it("refuses a response that names no media", async () => {
		backend({ body: { mediaId: 1 } });

		await expect(
			uploadRightNowPickedPhoto({ media: desktopPick }),
		).rejects.toBeInstanceOf(ApiError);
	});
});

describe("uploadRightNowPhotoFromUrl", () => {
	it("reads the drawer photo through the media proxy and uploads it again", async () => {
		backend();

		await expect(
			uploadRightNowPhotoFromUrl({ url: drawerUrl }),
		).resolves.toEqual(uploaded);

		expect(invokeMock).toHaveBeenCalledWith("stage_proxied_photo", {
			url: drawerUrl,
		});
		expect(uploadArgs()).toEqual({
			path: UPLOAD_PATH,
			signed: false,
			file: { source: "staged", id: "staged-drawer-photo" },
			crop: "cropAndThumb",
		});
		expect(commandsSent()).toEqual(["stage_proxied_photo", "upload_media"]);
	});

	it("uploads nothing when the drawer photo cannot be read", async () => {
		invokeMock.mockRejectedValue({
			kind: "Media",
			message: "That photo couldn't be loaded",
		});

		await expect(
			uploadRightNowPhotoFromUrl({ url: drawerUrl }),
		).rejects.toMatchObject({ message: "That photo couldn't be loaded" });
		expect(commandsSent()).toEqual(["stage_proxied_photo"]);
	});
});

describe("in the demo", () => {
	let objectUrls = 0;
	const createObjectURL = vi.fn(() => `blob:demo/photo-${++objectUrls}`);
	const original = Object.getOwnPropertyDescriptor(URL, "createObjectURL");

	beforeEach(() => {
		vi.stubGlobal("__DEMO__", true);
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: createObjectURL,
		});
	});

	afterEach(() => {
		if (original === undefined) {
			Reflect.deleteProperty(URL, "createObjectURL");
		} else {
			Object.defineProperty(URL, "createObjectURL", original);
		}
	});

	it("keeps a picked photo in the browser under a new id each time", async () => {
		const file = new File([new Uint8Array(5)], "photo.jpg", {
			type: "image/jpeg",
		});

		const first = await uploadRightNowPickedPhoto({
			media: {
				source: "web",
				key: "pick-4",
				mimeType: "image/jpeg",
				file,
			},
		});
		const second = await uploadRightNowPickedPhoto({
			media: {
				source: "web",
				key: "pick-3",
				mimeType: "image/jpeg",
				file,
			},
		});

		expect(first.url).toMatch(/^blob:/);
		expect(first.thumbnailUrl).toBe(first.url);
		expect(second.mediaId).not.toBe(first.mediaId);
		expect(createObjectURL).toHaveBeenCalledWith(file);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("reuses a drawer photo's url without fetching it", async () => {
		const photo = await uploadRightNowPhotoFromUrl({ url: drawerUrl });

		expect(photo).toMatchObject({
			url: drawerUrl,
			thumbnailUrl: drawerUrl,
		});
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("refuses a pick it cannot read in the browser", async () => {
		await expect(
			uploadRightNowPickedPhoto({ media: desktopPick }),
		).rejects.toThrow("The demo only reads files picked in the browser");
	});
});
