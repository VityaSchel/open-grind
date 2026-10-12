import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ demo: true, screenshots: true }));

vi.mock("$lib/demo/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./config")>();
	return {
		...actual,
		get demoEnabled() {
			return flags.demo;
		},
		get screenshotsEnabled() {
			return flags.screenshots;
		},
	};
});

import { ApiError } from "$lib/api/api-error";
import { callMethod } from "$lib/api/methods";
import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { fetchRest } from "$lib/api/transport";
import { updatesAvailableHere } from "$lib/updates";
import { load } from "../../routes/+layout";
import { demoMeProfileId } from "./config";
import { demoRoute } from "./route";
import {
	type DemoList,
	demoLists,
	type ScreenshotScene,
	screenshotScene,
} from "./screenshot-scene";

const initialScene = structuredClone(screenshotScene);

function setScene(scene: Partial<ScreenshotScene>): void {
	Object.assign(screenshotScene, scene);
}

afterEach(() => {
	Object.assign(screenshotScene, structuredClone(initialScene));
	flags.demo = true;
	flags.screenshots = true;
	requestBlockedAlertState.open = false;
	delete (window as { isTauri?: boolean }).isTauri;
});

describe("REST faults", () => {
	it("answers a matching request with the fault's status and body", async () => {
		setScene({
			restFaults: [
				{
					path: "/v2/taps/received",
					status: 503,
					body: { message: "Request failed" },
				},
			],
		});
		const response = await fetchRest("/v2/taps/received");
		expect(response.status).toBe(503);
		expect(response.json()).toEqual({ message: "Request failed" });
		expect(() => response.assertOk()).toThrow(ApiError);
	});

	it("throws a transport fault as the native error", async () => {
		setScene({
			restFaults: [
				{
					path: "/v7/views/list",
					error: { kind: "Connect", message: "offline" },
				},
			],
		});
		const failure = fetchRest("/v7/views/list");
		await expect(failure).rejects.toBeInstanceOf(ApiError);
		await expect(failure).rejects.toMatchObject({ kind: "Connect" });
	});

	it("matches the method, and a plain path ignores the query", async () => {
		setScene({
			restFaults: [{ method: "POST", path: "/v4/inbox", status: 500 }],
		});
		const inbox = await fetchRest("/v4/inbox?page=1", {
			method: "POST",
			body: {},
		});
		expect(inbox.status).toBe(500);
		setScene({
			restFaults: [{ method: "POST", path: "/v1/albums", status: 500 }],
		});
		expect((await fetchRest("/v1/albums")).status).toBe(200);
	});

	it("tests a pattern the page seeded as JSON against the whole path", async () => {
		const seeded: Partial<ScreenshotScene> = {
			restFaults: [
				{
					path: { pattern: String.raw`[?&]pageNumber=1\b` },
					status: 503,
				},
			],
		};
		setScene(JSON.parse(JSON.stringify(seeded)) as typeof seeded);
		expect((await fetchRest("/v4/cascade?pageNumber=1")).status).toBe(503);
		expect((await fetchRest("/v4/cascade?pageNumber=0")).status).toBe(200);
	});

	it("leaves requests alone without the flag", async () => {
		flags.screenshots = false;
		setScene({ restFaults: [{ path: "/v2/taps/received", status: 503 }] });
		expect((await fetchRest("/v2/taps/received")).status).toBe(200);
	});
});

describe("method faults", () => {
	it("rejects the command with the fault's native error", async () => {
		setScene({
			methodFaults: [
				{
					command: "storage_backend",
					error: { kind: "NotInitialized" },
				},
			],
		});
		await expect(callMethod("storage_backend")).rejects.toEqual({
			kind: "NotInitialized",
		});
	});

	it("opens the request-blocked alert as a native rejection does", async () => {
		setScene({
			methodFaults: [
				{
					command: "session_feature_flags",
					error: { kind: "RequestBlocked" },
				},
			],
		});
		await expect(callMethod("session_feature_flags")).rejects.toEqual({
			kind: "RequestBlocked",
		});
		expect(requestBlockedAlertState).toMatchObject({
			open: true,
			kind: "cloudflare",
		});
	});

	it("leaves commands alone without the flag", async () => {
		flags.screenshots = false;
		setScene({
			methodFaults: [
				{
					command: "storage_backend",
					error: { kind: "NotInitialized" },
				},
			],
		});
		await expect(callMethod("storage_backend")).resolves.toBe("keyring");
	});
});

describe("signed out", () => {
	it("has no session to read or refresh", async () => {
		setScene({ signedOut: true });
		expect((await callMethod("current_session")).profileId).toBeNull();
		await expect(callMethod("refresh_session")).rejects.toEqual({
			kind: "NotSignedIn",
		});
	});

	it("stays signed in without the flag", async () => {
		flags.screenshots = false;
		setScene({ signedOut: true });
		expect((await callMethod("current_session")).profileId).toBe(
			demoMeProfileId,
		);
		await expect(callMethod("refresh_session")).resolves.toMatchObject({
			profileId: demoMeProfileId,
		});
	});
});

describe("account status", () => {
	const restriction = { kind: "ageVerification", region: "GB" };

	it("reports the scene's account restriction", async () => {
		setScene({ restriction });
		await expect(callMethod("account_restriction")).resolves.toEqual(
			restriction,
		);
	});

	it("reports none without the flag", async () => {
		flags.screenshots = false;
		setScene({ restriction });
		await expect(callMethod("account_restriction")).resolves.toBeNull();
	});
});

describe("empty lists", () => {
	const listItems: Record<
		DemoList,
		{ path: string; method?: string; items: (body: never) => unknown[] }
	> = {
		albums: {
			path: "/v1/albums",
			items: (body: { albums: unknown[] }) => body.albums,
		},
		blocks: {
			path: "/v3.1/me/blocks",
			items: (body: { blocking: unknown[] }) => body.blocking,
		},
		drawer: {
			path: "/v4/chat/media/drawer",
			items: (body: unknown[]) => body,
		},
		grid: {
			path: "/v4/cascade?pageNumber=0",
			items: (body: { items: unknown[] }) => body.items,
		},
		inbox: {
			path: "/v4/inbox?page=1",
			method: "POST",
			items: (body: { entries: unknown[] }) => body.entries,
		},
		photos: {
			path: "/v3.1/me/profile/images?selected=true",
			items: (body: { medias: unknown[] }) => body.medias,
		},
		taps: {
			path: "/v2/taps/received",
			items: (body: { profiles: unknown[] }) => body.profiles,
		},
		views: {
			path: "/v7/views/list",
			items: (body: { profiles: unknown[]; previews: unknown[] }) => [
				...body.profiles,
				...body.previews,
			],
		},
	};

	function itemCount(list: DemoList): number {
		const { path, method = "GET", items } = listItems[list];
		return items(demoRoute({ path, method, body: {} }).body as never)
			.length;
	}

	for (const list of demoLists) {
		it(`empties ${list} and only ${list}`, () => {
			expect(itemCount(list)).toBeGreaterThan(0);
			setScene({ emptyLists: [list] });
			expect(itemCount(list)).toBe(0);
			for (const other of demoLists.filter((name) => name !== list)) {
				expect(itemCount(other), other).toBeGreaterThan(0);
			}
		});
	}

	it("keeps every list without the flag", () => {
		flags.screenshots = false;
		setScene({ emptyLists: [...demoLists] });
		for (const list of demoLists) {
			expect(itemCount(list), list).toBeGreaterThan(0);
		}
	});

	it("still answers the grid's search", () => {
		setScene({ emptyLists: ["grid"] });
		const { body } = demoRoute({
			path: "/v7/search",
			method: "GET",
			body: null,
		});
		expect(body).toEqual({ profiles: [] });
	});
});

describe("updates", () => {
	it("offers updates in a scene that asks for them", () => {
		(window as { isTauri?: boolean }).isTauri = true;
		expect(updatesAvailableHere()).toBe(false);
		setScene({ updates: true });
		expect(updatesAvailableHere()).toBe(true);
		flags.screenshots = false;
		expect(updatesAvailableHere()).toBe(false);
	});
});

describe("onboarding", () => {
	async function redirectFrom(pathname: string): Promise<unknown> {
		const event = { url: new URL(pathname, "http://localhost") };
		return (load as (event: unknown) => Promise<unknown>)(event).then(
			() => null,
			(redirect: { location?: string }) => redirect.location,
		);
	}

	it("opens onboarding only in a scene that asks for it", async () => {
		expect(await redirectFrom("/")).toBeNull();
		expect(await redirectFrom("/onboarding")).toBe("/");
		setScene({ onboarding: true });
		expect(await redirectFrom("/")).toBe("/onboarding");
		expect(await redirectFrom("/onboarding")).toBeNull();
	});

	it("never opens it in the demo without the flag", async () => {
		flags.screenshots = false;
		setScene({ onboarding: true });
		expect(await redirectFrom("/")).toBeNull();
	});
});
