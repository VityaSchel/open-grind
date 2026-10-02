import { parseSignedUrl, unsignedUrl } from "$lib/util/signed-url";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

const RECONCILE_RENEWAL_AGE_MS = 10 * 60 * 1000;
const REFRESH_RENEWAL_AGE_MS = 1000;

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

type Renewal = { renewalAgeMs: number };

function signatureIsStale({
	server,
	local,
	renewalAgeMs,
}: { server: unknown; local: unknown } & Renewal): boolean {
	return earliestExpiry(server) - earliestExpiry(local) >= renewalAgeMs;
}

type ServerAndLocal = { server: ApiResponseMessage; local: OptimisticMessage };

function sameBody({
	server,
	local,
	renewalAgeMs,
}: ServerAndLocal & Renewal): boolean {
	if (server.type !== local.type) return false;
	if (JSON.stringify(server.body) === JSON.stringify(local.body)) return true;
	return (
		withoutSignatures(server.body) === withoutSignatures(local.body) &&
		!signatureIsStale({
			server: server.body,
			local: local.body,
			renewalAgeMs,
		})
	);
}

function sameMetadata(
	server: ApiResponseMessage,
	local: OptimisticMessage,
): boolean {
	return (
		server.unsent === local.unsent &&
		server.dynamic === local.dynamic &&
		JSON.stringify(server.reactions) === JSON.stringify(local.reactions)
	);
}

function mergeServerVersion({
	server,
	local,
	renewalAgeMs,
}: ServerAndLocal & Renewal): { message: OptimisticMessage; updated: boolean } {
	const keepsLocalBody = sameBody({ server, local, renewalAgeMs });
	const updated = !keepsLocalBody || !sameMetadata(server, local);
	const merged = {
		...server,
		body: keepsLocalBody ? local.body : server.body,
		status: "sent",
	} as OptimisticMessage;
	const identical =
		!updated && JSON.stringify(merged) === JSON.stringify(local);
	return { message: identical ? local : merged, updated };
}

export function patchMessages({
	local,
	server,
}: {
	local: OptimisticMessage[];
	server: ApiResponseMessage[];
}): { messages: OptimisticMessage[]; changed: boolean } {
	const serverById = new Map(server.map((m) => [m.messageId, m] as const));
	let changed = false;
	const messages = local.map((message) => {
		const serverVersion = serverById.get(message.messageId);
		if (message.status !== "sent" || serverVersion === undefined)
			return message;
		const merge = mergeServerVersion({
			server: serverVersion,
			local: message,
			renewalAgeMs: REFRESH_RENEWAL_AGE_MS,
		});
		if (merge.updated) changed = true;
		return merge.message;
	});
	return { messages: removeDuplicateMessages(messages), changed };
}

export function sentMessages(
	messages: OptimisticMessage[],
): ApiResponseMessage[] {
	return messages
		.filter((m) => m.status === "sent")
		.map(({ status: _status, ...rest }) => {
			void _status;
			return rest;
		});
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
			const merge = mergeServerVersion({
				server: serverVersion,
				local: message,
				renewalAgeMs: RECONCILE_RENEWAL_AGE_MS,
			});
			merged.push(merge.message);
			if (merge.updated) updated++;
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
