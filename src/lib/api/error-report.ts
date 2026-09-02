import z from "zod";

import { ApiError } from "$lib/api/api-error";
import {
	capText,
	redactPath,
	redactStack,
	scrubText,
} from "$lib/api/redact/text";
import {
	readResponseBody,
	redactResponseBody,
	redactValue,
	valuePathKey,
} from "$lib/api/redact/value";

export type RedactionOptions = { redact: boolean };

const maxCauseDepth = 3;
const maxIssues = 20;
const maxIssueListItems = 12;
const maxMessageChars = 2000;
const maxReceivedChars = 100;

const issueCodesRevealingTheValue = new Set(["invalid_value"]);

const droppedIssueFields = new Set(["continue", "errors", "input", "inst"]);

export function errorReport(
	error: unknown,
	options: RedactionOptions,
): unknown {
	return describeError({ error, options, depth: 0 });
}

function describeError({
	error,
	options,
	depth,
}: {
	error: unknown;
	options: RedactionOptions;
	depth: number;
}): unknown {
	if (error instanceof ApiError)
		return describeApiError({ error, options, depth });
	if (error instanceof z.ZodError) {
		return {
			error: "Schema validation failed",
			issues: describeZodIssues({ error, options }),
		};
	}
	if (error instanceof Error)
		return describeThrown({ error, options, depth });
	if (typeof error === "object" && error !== null) {
		return options.redact ? redactValue(error) : error;
	}
	return { error: prose(String(error), options) };
}

function describeApiError({
	error,
	options,
	depth,
}: {
	error: ApiError;
	options: RedactionOptions;
	depth: number;
}): unknown {
	const { request, response } = error;
	const { redact } = options;
	const body =
		response === null ? undefined : readResponseBody(response.body);
	return {
		error: prose(error.message, { redact }),
		...(error.kind !== null && { kind: error.kind }),
		request: {
			method: request.method,
			path: redact ? redactPath(request.path) : request.path,
			...(request.body !== undefined && {
				body: redact ? redactValue(request.body) : request.body,
			}),
		},
		response:
			response === null
				? null
				: {
						status: response.status,
						body: redact
							? redactResponseBody(response.body, {
									keptEntries: entriesBlamedByIssues(error),
								})
							: readResponseBody(response.body),
					},
		...describeCause({ error, options, depth, body }),
	};
}

function entriesBlamedByIssues(error: Error): ReadonlySet<string> {
	const blamed = new Set<string>();
	if (!(error.cause instanceof z.ZodError)) return blamed;
	for (const issue of error.cause.issues) {
		issue.path.forEach((segment, index) => {
			if (typeof segment !== "number") return;
			blamed.add(valuePathKey(issue.path.slice(0, index + 1)));
		});
	}
	return blamed;
}

function describeThrown({
	error,
	options,
	depth,
}: {
	error: Error;
	options: RedactionOptions;
	depth: number;
}): unknown {
	const { redact } = options;
	return {
		error: prose(error.message, options),
		...(error.name !== "Error" && { name: error.name }),
		...(error.stack !== undefined && {
			stack: redact
				? redactStack({ stack: error.stack, message: error.message })
				: error.stack,
		}),
		...describeCause({ error, options, depth }),
	};
}

function describeCause({
	error,
	options,
	depth,
	body,
}: {
	error: Error;
	options: RedactionOptions;
	depth: number;
	body?: unknown;
}): Record<string, unknown> {
	const { cause } = error;
	if (cause instanceof z.ZodError) {
		return { issues: describeZodIssues({ error: cause, options, body }) };
	} else if (
		cause === null ||
		cause === undefined ||
		depth >= maxCauseDepth
	) {
		return {};
	} else {
		return {
			cause: describeError({ error: cause, options, depth: depth + 1 }),
		};
	}
}

function prose(value: string, { redact }: RedactionOptions): string {
	if (redact) {
		return scrubText(capText(value, maxMessageChars));
	} else {
		return value;
	}
}

function describeZodIssues({
	error,
	options,
	body,
}: {
	error: z.ZodError;
	options: RedactionOptions;
	body?: unknown;
}): unknown[] {
	const { issues } = error;
	const described: unknown[] = issues
		.slice(0, maxIssues)
		.map((issue) => describeZodIssue({ issue, options, body }));
	if (issues.length > maxIssues) {
		described.push(`<+${issues.length - maxIssues} more>`);
	}
	return described;
}

function describeZodIssue({
	issue,
	options,
	body,
}: {
	issue: z.core.$ZodIssue;
	options: RedactionOptions;
	body?: unknown;
}): unknown {
	const fields: Record<string, unknown> = { ...issue };
	const received = describeReceived({ issue, options, body });
	return Object.fromEntries([
		["path", formatZodIssuePath(issue.path)],
		...(received === undefined ? [] : [["received", received]]),
		...Object.entries(fields)
			.filter(([key]) => key !== "path" && !droppedIssueFields.has(key))
			.map(([key, value]) => [key, capList(value)]),
	]);
}

function valueAtPath({
	value,
	path,
}: {
	value: unknown;
	path: readonly PropertyKey[];
}): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<PropertyKey, unknown>)[segment];
	}
	return current;
}

function describeReceived({
	issue,
	options,
	body,
}: {
	issue: z.core.$ZodIssue;
	options: RedactionOptions;
	body?: unknown;
}): unknown {
	if (body === undefined) return undefined;
	const value = valueAtPath({ value: body, path: issue.path });
	if (value === undefined) return undefined;
	if (!options.redact) return value;
	if (!issueCodesRevealingTheValue.has(issue.code)) return redactValue(value);
	if (typeof value === "string") return capText(value, maxReceivedChars);
	if (typeof value === "object") return redactValue(value);
	return value;
}

function formatZodIssuePath(path: readonly PropertyKey[]): string {
	const formatted = path.reduce<string>((joined, segment) => {
		if (typeof segment === "number") return `${joined}[${segment}]`;
		return joined === "" ? String(segment) : `${joined}.${String(segment)}`;
	}, "");
	return formatted === "" ? "(root)" : formatted;
}

function capList(value: unknown): unknown {
	if (!Array.isArray(value) || value.length <= maxIssueListItems)
		return value;
	return [
		...value.slice(0, maxIssueListItems),
		`<+${value.length - maxIssueListItems} more>`,
	];
}
