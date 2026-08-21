import z from "zod";

const unsupportedSchema = z.discriminatedUnion("reason", [
	z.object({
		reason: z.literal("externallyManaged"),
		detail: z.object({ installer: z.string() }),
	}),
	z.object({ reason: z.literal("foreignSigner") }),
	z.object({ reason: z.literal("undetermined") }),
	z.object({
		reason: z.literal("noReleaseArtifacts"),
		detail: z.object({ target: z.string() }),
	}),
	z.object({
		reason: z.literal("sandboxed"),
		detail: z.object({ runtime: z.string() }),
	}),
]);
export type Unsupported = z.infer<typeof unsupportedSchema>;

const updateErrorSchema = z.union([
	z.object({
		kind: z.literal("server"),
		detail: z.object({ status: z.number() }),
	}),
	z.object({ kind: z.literal("unsupported"), detail: unsupportedSchema }),
	z.object({
		kind: z.enum([
			"network",
			"malformedIndex",
			"noArtifact",
			"unsigned",
			"foreignUrl",
			"signature",
			"storage",
			"oversize",
			"assetReplaced",
			"canceled",
			"nothingStaged",
			"needsUnknownSources",
			"needsManualInstall",
			"install",
			"checkTooSoon",
			"autoChecksDisabled",
		]),
		detail: z.unknown().optional(),
	}),
]);
export type UpdateError = z.infer<typeof updateErrorSchema>;

export function asUpdateError(error: unknown): UpdateError | undefined {
	const parsed = updateErrorSchema.safeParse(error);
	return parsed.success ? parsed.data : undefined;
}

export const capabilitySchema = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("supported"),
		detail: z.object({
			payloadSuffix: z.string(),
			canInstallNow: z.boolean(),
		}),
	}),
	z.object({ state: z.literal("unsupported"), detail: unsupportedSchema }),
]);
export type Capability = z.infer<typeof capabilitySchema>;

const artifactSchema = z.object({
	name: z.string(),
	url: z.string(),
	uuid: z.string(),
	size: z.number(),
});

const releaseSchema = z.object({
	tag: z.string(),
	version: z.string(),
	notes: z.string().nullish(),
	publishedAt: z.string().nullish(),
	payload: artifactSchema,
	signature: artifactSchema,
});
export type Release = z.infer<typeof releaseSchema>;

export const checkResultSchema = z.object({
	available: z.boolean(),
	currentVersion: z.string(),
	release: releaseSchema.nullish(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const progressSchema = z.object({
	tag: z.string(),
	version: z.string(),
	phase: z.enum(["downloading", "verifying", "ready", "canceled", "failed"]),
	detail: updateErrorSchema.optional(),
	received: z.number(),
	total: z.number(),
});
export type Progress = z.infer<typeof progressSchema>;

export const readinessSchema = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("ready"),
		detail: z.object({
			tag: z.string(),
			version: z.string(),
			canInstallNow: z.boolean(),
		}),
	}),
	z.object({
		state: z.literal("resumable"),
		detail: z.object({ tag: z.string(), version: z.string() }),
	}),
	z.object({ state: z.literal("nothingStaged") }),
	z.object({ state: z.literal("unsupported"), detail: unsupportedSchema }),
]);
export type Readiness = z.infer<typeof readinessSchema>;

export const settingsSchema = z.object({
	autoCheck: z.boolean(),
	nextCheckAt: z.number(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const installOutcomeSchema = z.object({
	succeeded: z.boolean(),
	canceled: z.boolean().default(false),
	code: z.number().nullish(),
	message: z.string().nullish(),
});
export type InstallOutcome = z.infer<typeof installOutcomeSchema>;
