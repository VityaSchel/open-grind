import type { ApiResponseMessage } from "$lib/model/messaging/messages";

export type OptimisticMessage = ApiResponseMessage & {
	status: "sent" | "pending" | "error";
	sendError?: unknown;
};

export function removeDuplicateMessages(
	messages: OptimisticMessage[],
): OptimisticMessage[] {
	const ids = new Set<string>();
	return messages
		.filter((m) => {
			if (ids.has(m.messageId)) return false;
			ids.add(m.messageId);
			return true;
		})
		.toSorted((a, b) => b.timestamp - a.timestamp);
}

function sameServerVersion(
	server: ApiResponseMessage,
	local: OptimisticMessage,
): boolean {
	return (
		server.unsent === local.unsent &&
		server.type === local.type &&
		JSON.stringify(server.reactions) === JSON.stringify(local.reactions)
	);
}

export function mergeServerMessages({
	local,
	server,
}: {
	local: OptimisticMessage[];
	server: ApiResponseMessage[];
}): {
	messages: OptimisticMessage[];
	fresh: OptimisticMessage[];
	changed: boolean;
} {
	const serverById = new Map(server.map((m) => [m.messageId, m] as const));
	const serverPageIsEmpty = server.length === 0;
	const oldestServerTs = server.at(-1)?.timestamp ?? Number.POSITIVE_INFINITY;

	const merged: OptimisticMessage[] = [];
	const seenLocalIds = new Set<string>();
	let dropped = 0;
	let updated = 0;

	for (const message of local) {
		if (message.status !== "sent") {
			merged.push(message);
			continue;
		}
		seenLocalIds.add(message.messageId);
		const serverVersion = serverById.get(message.messageId);
		if (serverVersion) {
			merged.push({ ...serverVersion, status: "sent" as const });
			if (!sameServerVersion(serverVersion, message)) updated++;
		} else if (!serverPageIsEmpty && message.timestamp < oldestServerTs) {
			merged.push(message);
		} else {
			dropped++;
		}
	}

	const fresh: OptimisticMessage[] = [];
	for (const serverVersion of server) {
		if (seenLocalIds.has(serverVersion.messageId)) continue;
		const message: OptimisticMessage = {
			...serverVersion,
			status: "sent" as const,
		};
		merged.push(message);
		fresh.push(message);
	}

	return {
		messages: removeDuplicateMessages(merged),
		fresh,
		changed: fresh.length > 0 || dropped > 0 || updated > 0,
	};
}

/**
 * Walks oldest-first because the server echoes sends in order, preferring a
 * type match. Two same-type sends whose echoes arrive out of order can still
 * cross-assign: the API echoes no client correlation id, so position is the
 * only signal there is.
 */
export function matchPendingEcho({
	messages,
	incoming,
}: {
	messages: OptimisticMessage[];
	incoming: ApiResponseMessage;
}): OptimisticMessage | undefined {
	let oldestPendingOfAnyType: OptimisticMessage | undefined;
	for (let i = messages.length - 1; i >= 0; i--) {
		const candidate = messages[i];
		if (candidate?.status !== "pending") continue;
		if (candidate.type === incoming.type) return candidate;
		oldestPendingOfAnyType ??= candidate;
	}
	return oldestPendingOfAnyType;
}
