export const liveAccounts = { app: 858049792, counterpart: 880215879 } as const;

const ownerMainAccount = 852120758;

const liveAccountIds: ReadonlySet<number> = new Set(
	Object.values(liveAccounts),
);

export class LiveGuardError extends Error {
	override name = "LiveGuardError";
}

export function assertLiveAccount(profileId: number) {
	if (!liveAccountIds.has(profileId)) {
		throw new LiveGuardError(`${profileId} is not a live-test account`);
	}
}

export function assertLiveWrite({
	actor,
	target,
}: {
	actor: number;
	target: number;
}) {
	assertLiveAccount(actor);
	assertLiveAccount(target);
}

export function assertLiveRequest({
	path,
	body,
}: {
	path: string;
	body?: unknown;
}) {
	const request = `${path} ${JSON.stringify(body ?? null)}`;
	if (request.includes(String(ownerMainAccount))) {
		throw new LiveGuardError(
			"A live write must never name the owner's account",
		);
	}
	for (const [, first, second] of path.matchAll(/(\d+):(\d+)/g)) {
		assertLiveAccount(Number(first));
		assertLiveAccount(Number(second));
	}
}

export function assertSignedInAsApp(profileId: number | null) {
	if (profileId !== liveAccounts.app) {
		throw new LiveGuardError(
			`The app must be signed in as ${liveAccounts.app}, not ${profileId ?? "nobody"}`,
		);
	}
}

export function conversationIdBetween(a: number, b: number) {
	return [a, b].toSorted((x, y) => x - y).join(":");
}
