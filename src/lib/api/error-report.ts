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
} from "$lib/api/redact/value";

export type RedactionOptions = {
	redact: boolean;
};

const maxCauseDepth = 3;
const maxIssues = 20;
const maxIssueListItems = 12;
const maxMessageChars = 2000;

const droppedIssueFields = new Set(["continue", "errors", "input", "inst"]);

export function errorReport(
	error: unknown,
	options: RedactionOptions,
): unknown {
	return describeError(error, options, 0);
}

function describeError(
	error: unknown,
	options: RedactionOptions,
	depth: number,
): unknown {
	if (error instanceof ApiError) return describeApiError(error, options, depth);
	if (error instanceof z.ZodError) {
		return {
			error: "Schema validation failed",
			issues: describeZodIssues(error),
		};
	}
	if (error instanceof Error) return describeThrown(error, options, depth);
	if (typeof error === "object" && error !== null) {
		return options.redact ? redactValue(error) : error;
	}
	return { error: prose(String(error), options) };
}

function describeApiError(
	error: ApiError,
	options: RedactionOptions,
	depth: number,
): unknown {
	const { request, response } = error;
	const { redact } = options;
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
							? redactResponseBody(response.body)
							: readResponseBody(response.body),
					},
		...describeCause(error, options, depth),
	};
}

function describeThrown(
	error: Error,
	options: RedactionOptions,
	depth: number,
): unknown {
	const { redact } = options;
	return {
		error: prose(error.message, options),
		...(error.name !== "Error" && { name: error.name }),
		...(error.stack !== undefined && {
			stack: redact ? redactStack(error.stack, error.message) : error.stack,
		}),
		...describeCause(error, options, depth),
	};
}

function describeCause(
	error: Error,
	options: RedactionOptions,
	depth: number,
): Record<string, unknown> {
	const { cause } = error;
	if (cause instanceof z.ZodError) {
		return { issues: describeZodIssues(cause) };
	} else if (cause === null || cause === undefined || depth >= maxCauseDepth) {
		return {};
	} else {
		return { cause: describeError(cause, options, depth + 1) };
	}
}

function prose(value: string, { redact }: RedactionOptions): string {
	if (redact) {
		return scrubText(capText(value, maxMessageChars));
	} else {
		return value;
	}
}

function describeZodIssues(error: z.ZodError): unknown[] {
	const { issues } = error;
	const described: unknown[] = issues.slice(0, maxIssues).map(describeZodIssue);
	if (issues.length > maxIssues) {
		described.push(`<+${issues.length - maxIssues} more>`);
	}
	return described;
}

function describeZodIssue(issue: z.core.$ZodIssue): unknown {
	const fields: Record<string, unknown> = { ...issue };
	return Object.fromEntries([
		["path", formatZodIssuePath(issue.path)],
		...Object.entries(fields)
			.filter(([key]) => key !== "path" && !droppedIssueFields.has(key))
			.map(([key, value]) => [key, capList(value)]),
	]);
}

function formatZodIssuePath(path: readonly PropertyKey[]): string {
	const formatted = path.reduce<string>((joined, segment) => {
		if (typeof segment === "number") return `${joined}[${segment}]`;
		return joined === "" ? String(segment) : `${joined}.${String(segment)}`;
	}, "");
	return formatted === "" ? "(root)" : formatted;
}

function capList(value: unknown): unknown {
	if (!Array.isArray(value) || value.length <= maxIssueListItems) return value;
	return [
		...value.slice(0, maxIssueListItems),
		`<+${value.length - maxIssueListItems} more>`,
	];
}
