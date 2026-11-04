import { afterEach, describe, expect, it, vi } from "vitest";

const EMOJI = /\p{Extended_Pictographic}/u;
const FRESH_IMPORTS = { timeout: 60_000 };
const FEATURED_IDS = Array.from(
	{ length: 1000 },
	(_, index) => 100_000 + index,
);

async function demoFixtures({ screenshots }: { screenshots: boolean }) {
	vi.stubGlobal("__SCREENSHOTS__", screenshots);
	vi.resetModules();
	const [{ DEMO_ID_START, DEMO_PROFILE_COUNT }, profiles, conversations] =
		await Promise.all([
			import("../config"),
			import("./profiles"),
			import("./conversations"),
		]);
	const gridIds = Array.from(
		{ length: DEMO_PROFILE_COUNT },
		(_, index) => DEMO_ID_START + index,
	);
	const seeds = [...FEATURED_IDS, ...gridIds].map(profiles.profileSeed);
	const inbox = conversations.demoConversations({ page: 1 });
	const threads = inbox.entries.map(({ data }) =>
		conversations.demoConversationMessages({
			conversationId: data.conversationId,
		}),
	);
	return { seeds, text: JSON.stringify({ seeds, inbox, threads }) };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("neutralText", () => {
	it("drops emoji and keeps the words in screenshot builds", async () => {
		vi.stubGlobal("__SCREENSHOTS__", true);
		const { neutralText } = await import("./neutral");
		expect(neutralText("theo 🌊")).toBe("theo");
		expect(neutralText("👀 just  here 🏖️ to chat")).toBe(
			"just here to chat",
		);
		expect(neutralText("👍🏽")).toBe("Lorem");
		expect(neutralText("")).toBe("");
	});

	it("keeps the text as it is otherwise", async () => {
		const { neutralText } = await import("./neutral");
		expect(neutralText("theo 🌊")).toBe("theo 🌊");
	});
});

describe("demo fixtures in screenshot builds", FRESH_IMPORTS, () => {
	it("show no emoji in names, bios or messages", async () => {
		const plain = await demoFixtures({ screenshots: false });
		expect(plain.text).toMatch(EMOJI);
		const neutral = await demoFixtures({ screenshots: true });
		expect(neutral.text).not.toMatch(EMOJI);
		expect(neutral.seeds.find(({ id }) => id === 100_002)?.name).toBe(
			"Lorem",
		);
	});
});

describe("Instagram handles", FRESH_IMPORTS, () => {
	it("contain a hyphen, which Instagram never allows", async () => {
		const { seeds } = await demoFixtures({ screenshots: false });
		const { meSeed } = await import("./profiles");
		const handles = [meSeed, ...seeds].flatMap(({ instagram }) =>
			instagram === null ? [] : [instagram],
		);
		expect(handles.length).toBeGreaterThan(100);
		expect(handles.filter((handle) => !handle.includes("-"))).toEqual([]);
	});
});
