import { parseSignedUrl, unsignedUrl } from "$lib/util/signed-url";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

const SIGNATURE_RENEWAL_AGE_MS = 10 * 60 * 1000;

export type OptimisticMessage = ApiResponseMessage & {
	status: "sent" | "pending" | "error";
	sendError?: unknown;
};

export function previewedMessage(
	messages: OptimisticMessage[],
): OptimisticMessage | undefined {
	return messages.find((m) => m.status !== "error");
}

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

function withoutSignatures(body: unknown): string {
	return JSON.stringify(body, (_key, value: unknown) =>
		typeof value === "string" ? unsignedUrl(value) : value,
	);
}

function stringsIn(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (typeof value !== "object" || value === null) return [];
	return Object.values(value).flatMap(stringsIn);
}

function earliestExpiry(body: unknown): number {
	return Math.min(
		...stringsIn(body).map(
			(value) =>
				parseSignedUrl(value)?.expiresAt ?? Number.POSITIVE_INFINITY,
		),
	);
}

function signatureIsStale({
	server,
	local,
}: {
	server: unknown;
	local: unknown;
}): boolean {
	return (
		earliestExpiry(server) - earliestExpiry(local) >=
		SIGNATURE_RENEWAL_AGE_MS
	);
}

function sameBody({
	server,
	local,
}: {
	server: ApiResponseMessage;
	local: OptimisticMessage;
}): boolean {
	if (server.type !== local.type) return false;
	if (JSON.stringify(server.body) === JSON.stringify(local.body)) return true;
	return (
		withoutSignatures(server.body) === withoutSignatures(local.body) &&
		!signatureIsStale({ server: server.body, local: local.body })
	);
}

function sameMetadata(
	server: ApiResponseMessage,
	local: OptimisticMessage,
): boolean {
	return (
		server.unsent === local.unsent &&
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
			const keepsLocalBody = sameBody({
				server: serverVersion,
				local: message,
			});
			merged.push({
				...serverVersion,
				body: keepsLocalBody ? message.body : serverVersion.body,
				status: "sent",
			} as OptimisticMessage);
			if (!keepsLocalBody || !sameMetadata(serverVersion, message))
				updated++;
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
