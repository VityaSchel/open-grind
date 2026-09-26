import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { liveAccounts, LiveGuardError } from "./accounts";
import {
	albumContentOf,
	albumContentServerId,
	cleanUpLedger,
	Ledger,
	type LedgerCleaners,
	LedgerError,
} from "./ledger";
import { RateLimitedError, stopTheRun } from "./rate-limit";

let dir: string;
let file: string;
let stopFile: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "og-ledger-"));
	file = join(dir, "nested", "ledger.json");
	stopFile = join(dir, "stop.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const album = {
	kind: "album",
	serverId: "4242",
	owner: liveAccounts.app,
	label: "og-e2e-album",
} as const;

const albumContent = {
	kind: "album-content",
	serverId: "171895014/1129715920",
	owner: liveAccounts.app,
	label: "unique album photo",
} as const;

const conversation = {
	kind: "conversation",
	serverId: "858049792:880215879",
	owner: liveAccounts.app,
	label: "chat with the counterpart",
} as const;

function cleanersThat(
	clean: (kind: string) => Promise<void> = () => Promise.resolve(),
): LedgerCleaners {
	return {
		album: vi.fn(() => clean("album")),
		"album-content": vi.fn(() => clean("album-content")),
		conversation: vi.fn(() => clean("conversation")),
		"drawer-media": vi.fn(() => clean("drawer-media")),
	};
}

describe("Ledger", () => {
	it("starts empty when nothing was recorded yet", () => {
		expect(new Ledger(file).entries()).toEqual([]);
	});

	it("keeps recorded objects across runs", () => {
		new Ledger(file).record(album);
		expect(new Ledger(file).pending()).toMatchObject([album]);
	});

	it("records the same server object only once while it is pending", () => {
		const ledger = new Ledger(file);
		const first = ledger.record(conversation);
		const second = ledger.record(conversation);
		expect(second.id).toBe(first.id);
		expect(ledger.entries()).toHaveLength(1);
	});

	it("drops cleaned objects from the pending list", () => {
		const ledger = new Ledger(file);
		const recorded = ledger.record(album);
		ledger.record(conversation);
		ledger.markCleaned(recorded.id);
		expect(ledger.pending()).toMatchObject([conversation]);
		expect(ledger.entries()).toHaveLength(2);
	});

	it("refuses to record an object owned by an account outside the burners", () => {
		expect(() =>
			new Ledger(file).record({ ...album, owner: 852120758 }),
		).toThrow(LiveGuardError);
		expect(new Ledger(file).entries()).toEqual([]);
	});
});

describe("album content server ids", () => {
	it("pairs the album with the content it holds", () => {
		expect(albumContentServerId({ albumId: "4242", contentId: "7" })).toBe(
			"4242/7",
		);
	});

	it("reads back the album and content of a recorded pair", () => {
		expect(albumContentOf("171895014/1129715920")).toEqual({
			albumId: "171895014",
			contentId: "1129715920",
		});
	});

	it.each(["171895014", "171895014/", "/1129715920", "1/2/3", "a/b"])(
		"refuses %j, which names no single album item",
		(serverId) => {
			expect(() => albumContentOf(serverId)).toThrow(LedgerError);
		},
	);
});

describe("cleanUpLedger", () => {
	it("cleans every pending object with the cleaner for its kind", async () => {
		const ledger = new Ledger(file);
		ledger.record(album);
		ledger.record(conversation);
		const cleaners = cleanersThat();
		const { failed } = await cleanUpLedger({ ledger, cleaners, stopFile });
		expect(failed).toEqual([]);
		expect(cleaners.album).toHaveBeenCalledWith(
			expect.objectContaining({ serverId: "4242" }),
		);
		expect(cleaners.conversation).toHaveBeenCalledOnce();
		expect(ledger.pending()).toEqual([]);
	});

	it("cleans album content with its own cleaner, not the album's", async () => {
		const ledger = new Ledger(file);
		ledger.record(albumContent);
		const cleaners = cleanersThat();
		await cleanUpLedger({ ledger, cleaners, stopFile });
		expect(cleaners["album-content"]).toHaveBeenCalledWith(
			expect.objectContaining({ serverId: "171895014/1129715920" }),
		);
		expect(cleaners.album).not.toHaveBeenCalled();
		expect(ledger.pending()).toEqual([]);
	});

	it("keeps an object pending when its cleanup fails", async () => {
		const ledger = new Ledger(file);
		ledger.record(album);
		ledger.record(conversation);
		const { failed } = await cleanUpLedger({
			ledger,
			stopFile,
			cleaners: cleanersThat((kind) =>
				kind === "album"
					? Promise.reject(new Error("still there"))
					: Promise.resolve(),
			),
		});
		expect(failed.map(({ entry }) => entry.kind)).toEqual(["album"]);
		expect(ledger.pending()).toMatchObject([album]);
	});

	it("stops at the first rate limit without trying the rest", async () => {
		const ledger = new Ledger(file);
		ledger.record(album);
		ledger.record(conversation);
		const cleaners = cleanersThat(() =>
			Promise.reject(new RateLimitedError("the cleanup")),
		);
		await expect(
			cleanUpLedger({ ledger, cleaners, stopFile }),
		).rejects.toThrow(RateLimitedError);
		expect(cleaners.conversation).not.toHaveBeenCalled();
		expect(ledger.pending()).toHaveLength(2);
	});

	it("leaves everything pending once the run has stopped", async () => {
		const ledger = new Ledger(file);
		ledger.record(album);
		ledger.record(conversation);
		stopTheRun({ reason: "Grindr rate limited the app", file: stopFile });
		const cleaners = cleanersThat();
		await cleanUpLedger({ ledger, cleaners, stopFile });
		expect(cleaners.album).not.toHaveBeenCalled();
		expect(cleaners.conversation).not.toHaveBeenCalled();
		expect(ledger.pending()).toHaveLength(2);
	});
});
