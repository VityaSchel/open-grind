import z from "zod";

import { arrayOfParsableEntries, serverDefault } from "#lib/model/tolerance.ts";

export const assignmentSchema = z.object({
	key: z.string(),
	value: z.string().nullable(),
	payload: z.record(z.string(), z.unknown()).nullable().default(null),
	type: z.string().nullable().default(null),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const assignmentsResponseSchema = z.object({
	assignments: serverDefault({
		value: arrayOfParsableEntries({
			entries: assignmentSchema,
			label: "assignments",
		}),
		fallback: [],
	}),
});
