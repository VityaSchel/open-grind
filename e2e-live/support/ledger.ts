import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import z from "zod";

import { assertLiveAccount } from "./accounts";
import { RateLimitedError, stopReason } from "./rate-limit";

const ledgerEntrySchema = z.object({
	id: z.string(),
	kind: z.enum(["conversation", "album", "album-content", "drawer-media"]),
	serverId: z.string(),
	owner: z.number(),
	label: z.string(),
	createdAt: z.string(),
	cleanedAt: z.string().nullable(),
});

function isMissingFile(error: unknown) {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LedgerKind = LedgerEntry["kind"];
export type NewLedgerEntry = Pick<
	LedgerEntry,
	"kind" | "serverId" | "owner" | "label"
>;

export class LedgerError extends Error {
	override name = "LedgerError";
}

export function albumContentServerId({
	albumId,
	contentId,
}: {
	albumId: string;
	contentId: string;
}) {
	return `${albumId}/${contentId}`;
}

export function albumContentOf(serverId: string) {
	const [, albumId, contentId] = serverId.match(/^(\d+)\/(\d+)$/) ?? [];
	if (albumId === undefined || contentId === undefined) {
		throw new LedgerError(`${serverId} is not an album/content pair`);
	}
	return { albumId, contentId };
}

export class Ledger {
	readonly #file: string;
	readonly #now: () => Date;

	constructor(file: string, { now = () => new Date() } = {}) {
		this.#file = file;
		this.#now = now;
	}

	entries(): LedgerEntry[] {
		let raw: string;
		try {
			raw = readFileSync(this.#file, "utf8");
		} catch (error) {
			if (isMissingFile(error)) return [];
			throw error;
		}
		return z.array(ledgerEntrySchema).parse(JSON.parse(raw));
	}

	pending() {
		return this.entries().filter((entry) => entry.cleanedAt === null);
	}

	record(entry: NewLedgerEntry): LedgerEntry {
		assertLiveAccount(entry.owner);
		const entries = this.entries();
		const existing = entries.find(
			(candidate) =>
				candidate.cleanedAt === null &&
				candidate.kind === entry.kind &&
				candidate.serverId === entry.serverId,
		);
		if (existing !== undefined) return existing;
		const recorded: LedgerEntry = {
			...entry,
			id: randomUUID(),
			createdAt: this.#now().toISOString(),
			cleanedAt: null,
		};
		this.#write([...entries, recorded]);
		return recorded;
	}

	markCleaned(id: string) {
		const cleanedAt = this.#now().toISOString();
		this.#write(
			this.entries().map((entry) =>
				entry.id === id ? { ...entry, cleanedAt } : entry,
			),
		);
	}

	#write(entries: LedgerEntry[]) {
		mkdirSync(dirname(this.#file), { recursive: true });
		const staging = `${this.#file}.${process.pid}.tmp`;
		writeFileSync(staging, JSON.stringify(entries, null, "\t"));
		renameSync(staging, this.#file);
	}
}

export type LedgerCleaners = Record<
	LedgerKind,
	(entry: LedgerEntry) => Promise<void>
>;

export async function cleanUpLedger({
	ledger,
	cleaners,
	stopFile,
}: {
	ledger: Ledger;
	cleaners: LedgerCleaners;
	stopFile: string;
}) {
	const failed: { entry: LedgerEntry; error: unknown }[] = [];
	for (const entry of ledger.pending()) {
		if (stopReason(stopFile) !== null) break;
		try {
			await cleaners[entry.kind](entry);
			ledger.markCleaned(entry.id);
		} catch (error) {
			if (error instanceof RateLimitedError) throw error;
			failed.push({ entry, error });
		}
	}
	return { failed };
}
