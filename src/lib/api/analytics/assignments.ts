import { FetchCache } from "#lib/api/cache.ts";
import { fetchRest } from "#lib/api/transport.ts";
import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import {
	type Assignment,
	assignmentsResponseSchema,
} from "#lib/model/analytics/assignments.ts";
import { coarsenGeohash } from "#lib/model/geohash.ts";

const ASSIGNMENTS_TTL_MS = 5 * 60_000;

export async function getAssignments({
	geohash,
}: {
	geohash: string;
}): Promise<Assignment[]> {
	const res = await fetchRest(
		`/v3/assignment?geohash=${coarsenGeohash(geohash)}`,
	);
	return res.jsonParsed(assignmentsResponseSchema).assignments;
}

export async function getPublicAssignments(): Promise<Assignment[]> {
	const res = await fetchRest("/public/v1/assignments");
	return res.jsonParsed(assignmentsResponseSchema).assignments;
}

const assignmentsByGeohash = new FetchCache<string, Assignment[]>(
	(geohash) => getAssignments({ geohash }),
	{ ttlMs: ASSIGNMENTS_TTL_MS },
);

async function assignmentsForStoredLocation(): Promise<Assignment[]> {
	const { geohash } = await getPreferences();
	if (geohash === null) return [];
	return await assignmentsByGeohash.fetch(geohash);
}

export async function isAssignmentOn({
	key,
}: {
	key: string;
}): Promise<boolean> {
	const assignments = await assignmentsForStoredLocation().catch(() => []);
	return assignments.some(
		(assignment) => assignment.key === key && assignment.value === "on",
	);
}
