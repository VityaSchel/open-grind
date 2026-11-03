import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("$lib/ws.svelte", () => ({ ws: { connect } }));
vi.mock("$lib/platform/regional-settings", () => ({
	startRegionalSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/platform/app-language", () => ({
	startLanguage: vi.fn(() => Promise.resolve()),
}));

const FRESH_IMPORTS = { timeout: 60_000 };

async function freshApp() {
	vi.resetModules();
	const [{ init }, { demo }] = await Promise.all([
		import("../../hooks.client"),
		import("$lib/demo"),
	]);
	return { init, demo };
}

beforeEach(() => {
	vi.stubGlobal("__DEMO__", true);
});

afterEach(() => {
	connect.mockReset();
	vi.unstubAllGlobals();
});

describe("the demo runtime", FRESH_IMPORTS, () => {
	it("is loaded before the app connects", async () => {
		const { init, demo } = await freshApp();
		const runtimeOnConnect: unknown[] = [];
		connect.mockImplementation(() => {
			runtimeOnConnect.push(demo());
		});
		await init();
		expect(runtimeOnConnect).toEqual([
			expect.objectContaining({ demoRoute: expect.any(Function) }),
		]);
	});

	it("stays unloaded outside the demo", async () => {
		vi.stubGlobal("__DEMO__", false);
		const { init, demo } = await freshApp();
		await init();
		expect(() => demo()).toThrow("The demo is not loaded yet");
	});
});
