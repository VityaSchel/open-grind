import { invoke, isTauri } from "@tauri-apps/api/core";
import z from "zod";

const mediaFailureSchema = z.object({
	kind: z.enum([
		"status",
		"connect",
		"transport",
		"tooLarge",
		"refused",
		"notReady",
	]),
	status: z.int().nullable(),
	host: z.string(),
	signatureExpired: z.boolean(),
});

export type MediaFailure = z.infer<typeof mediaFailureSchema>;

export async function mediaFailure(src: string): Promise<MediaFailure | null> {
	if (!isTauri()) return null;
	try {
		return mediaFailureSchema
			.nullable()
			.parse(await invoke("media_failure", { src }));
	} catch (error) {
		console.error(error);
		return null;
	}
}

export function describeMediaFailure(failure: MediaFailure | null): string {
	if (failure === null) return "no details";
	const what =
		failure.kind === "status" ? `status ${failure.status}` : failure.kind;
	const expired = failure.signatureExpired ? ", signature expired" : "";
	return `${what} from ${failure.host}${expired}`;
}
