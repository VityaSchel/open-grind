import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { FetchCache } from "$lib/api/cache";
import { now } from "$lib/util/clock";

type ListedProfile = { profileId: number };

type Snapshot<Entry extends ListedProfile> = {
	entries: Entry[];
	requestedAt: number;
};

type Edit = { listed: boolean; completedAt: number };

function isRequestedAfter({
	snapshot,
	edit,
}: {
	snapshot: Snapshot<ListedProfile>;
	edit: Edit;
}): boolean {
	return snapshot.requestedAt > edit.completedAt;
}

export class EditableServerList<Entry extends ListedProfile> {
	#snapshots: FetchCache<null, Snapshot<Entry>>;
	#latestEditByProfileId = new Map<number, Edit>();

	constructor({
		request,
		ttlMs,
	}: {
		request: () => Promise<Entry[]>;
		ttlMs: number;
	}) {
		this.#snapshots = new FetchCache<null, Snapshot<Entry>>(
			() => this.#requestSnapshot(request),
			{ ttlMs },
		);
		registerAccountCache({
			reset: () => this.#latestEditByProfileId.clear(),
		});
	}

	async entries(): Promise<Entry[]> {
		return this.#withoutEntriesRemovedSince(
			await this.#snapshots.fetch(null),
		);
	}

	addedHereNewestFirst(): number[] {
		return [...this.#latestEditByProfileId]
			.filter(([, edit]) => edit.listed)
			.map(([profileId]) => profileId)
			.toReversed();
	}

	async add({
		profileId,
		request,
	}: {
		profileId: number;
		request: () => Promise<void>;
	}): Promise<void> {
		await this.#edit({ profileId, listed: true, request });
		this.#snapshots.clear();
	}

	async remove({
		profileId,
		request,
	}: {
		profileId: number;
		request: () => Promise<void>;
	}): Promise<void> {
		await this.#edit({ profileId, listed: false, request });
	}

	async #requestSnapshot(
		request: () => Promise<Entry[]>,
	): Promise<Snapshot<Entry>> {
		const requestedAt = now();
		const snapshot = { entries: await request(), requestedAt };
		this.#forgetEditsUndoneElsewhere(snapshot);
		return snapshot;
	}

	async #edit({
		profileId,
		listed,
		request,
	}: {
		profileId: number;
		listed: boolean;
		request: () => Promise<void>;
	}): Promise<void> {
		const epoch = accountEpoch();
		await request();
		if (!isAccountEpochCurrent(epoch)) return;
		this.#recordAsNewestEdit({
			profileId,
			edit: { listed, completedAt: now() },
		});
	}

	#recordAsNewestEdit({
		profileId,
		edit,
	}: {
		profileId: number;
		edit: Edit;
	}): void {
		this.#latestEditByProfileId.delete(profileId);
		this.#latestEditByProfileId.set(profileId, edit);
	}

	#withoutEntriesRemovedSince(snapshot: Snapshot<Entry>): Entry[] {
		return snapshot.entries.filter(({ profileId }) => {
			const edit = this.#latestEditByProfileId.get(profileId);
			return !edit || edit.listed || isRequestedAfter({ snapshot, edit });
		});
	}

	#forgetEditsUndoneElsewhere(snapshot: Snapshot<Entry>): void {
		const listedIds = new Set(
			snapshot.entries.map(({ profileId }) => profileId),
		);
		for (const [profileId, edit] of this.#latestEditByProfileId) {
			const undoneElsewhere =
				isRequestedAfter({ snapshot, edit }) &&
				listedIds.has(profileId) !== edit.listed;
			if (undoneElsewhere) this.#latestEditByProfileId.delete(profileId);
		}
	}
}
