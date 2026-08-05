import type { Context, Op } from "./context";
import {
	describeType,
	flattenSchema,
	isEmptyObjectSchema,
	isPlaceholderBody,
	isPlaceholderSchema,
	renderProperty,
} from "./properties";
import { urlForParamGroup, urlForSchema, withWipSuffix } from "./slugs";
import type { Parameter, ParameterOrRef, Schema } from "./types";

const HTTP_DEFAULT_DESCRIPTIONS = new Set([
	"OK",
	"Created",
	"Accepted",
	"No Content",
	"Switching Protocols",
	"",
]);

function humanizeOperationId(opId: string): string {
	return opId
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.toLowerCase()
		.replace(/^./, (c) => c.toUpperCase());
}

function resolveParam(ctx: Context, p: ParameterOrRef): Parameter | undefined {
	if ("$ref" in p) {
		const name = p.$ref.replace("#/components/parameters/", "");
		return ctx.doc.components.parameters?.[name];
	}
	return p;
}

function seeAlsoText(link: string): string {
	const anchor = link.split("#")[1];
	if (!anchor) return link;
	return anchor.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function displayOf(ctx: Context, name: string): string {
	return ctx.doc.components.schemas[name]?.["x-display-name"] ?? name;
}

function refName(ref: string): string {
	return ref.replace("#/components/schemas/", "");
}

function placeholderOriginalType(schema: Schema): string | undefined {
	const ref = schema.$ref ? refName(schema.$ref) : undefined;
	return (
		schema["x-original-type"] ??
		schema.allOf?.[0]?.["x-original-type"] ??
		(ref && ref !== "UndocumentedObject" ? ref : undefined)
	);
}

function withDeprecatedSuffix(title: string): string {
	if (/,\s*WIP$/i.test(title))
		return title.replace(/,\s*WIP$/i, " (deprecated), WIP");
	return `${title} (deprecated)`;
}

function appendOptional(propertyLine: string, optional: boolean): string {
	if (!optional) return propertyLine;
	const nl = propertyLine.indexOf("\n");
	const head = nl >= 0 ? propertyLine.slice(0, nl) : propertyLine;
	const tail = nl >= 0 ? propertyLine.slice(nl) : "";
	if (/,\s*optional$/i.test(head)) return propertyLine;
	return `${head}, optional${tail}`;
}

export function renderBodySchema(
	ctx: Context,
	schema: Schema | undefined,
): string[] {
	if (!schema) return [];

	if (
		isPlaceholderSchema(
			schema,
			(name: string): Schema | undefined => ctx.doc.components.schemas[name],
		)
	) {
		const original = schema["x-original-type"];
		return original ? [`Response type: \`${original}\` (undocumented).`] : [];
	}
	let s = schema;
	if (s.$ref) {
		const name = refName(s.$ref);
		const resolved = ctx.doc.components.schemas[name];
		if (resolved) {
			if ((resolved.allOf || resolved.oneOf) && ctx.renderedSchemas.has(name)) {
				return [`[${displayOf(ctx, name)}](${urlForSchema(ctx, name)})`];
			}
			s = resolved;
		}
	}
	if (s.type === "array") {
		const itemRef = s.items?.$ref;
		if (itemRef) {
			const name = refName(itemRef);
			if (ctx.renderedSchemas.has(name)) {
				return [
					`Array of [${displayOf(ctx, name)}](${urlForSchema(ctx, name)}).`,
				];
			}
			const body = flattenSchema(ctx.doc.components.schemas[name]);
			if (
				body &&
				(Object.keys(body.properties).length || body.__allOfRefs.length)
			) {
				const out = ["Array of objects:"];
				for (const r of body.__allOfRefs) {
					out.push(
						`- *everything from [${displayOf(ctx, r)}](${urlForSchema(ctx, r)})*`,
					);
				}
				for (const [k, v] of Object.entries(body.properties)) {
					out.push(renderProperty(ctx, k, v, 0, body.required.includes(k)));
				}
				return out;
			}
		}
		if (s.items?.type === "object" && s.items.properties) {
			const out = ["Array of objects:"];
			const reqList = s.items.required ?? [];
			for (const [k, v] of Object.entries(s.items.properties)) {
				out.push(renderProperty(ctx, k, v, 0, reqList.includes(k)));
			}
			return out;
		}
		const resolveForArray = (name: string): Schema | undefined =>
			ctx.doc.components.schemas[name];
		if (isPlaceholderSchema(s.items, resolveForArray)) {
			const original = s.items?.["x-original-type"];
			return original ? [`Response type: \`${original}\` (undocumented).`] : [];
		}
		const inner = describeType(ctx, s.items);
		return [`Array of ${inner}.`];
	}
	if (s.type === "object" && s.properties) {
		const reqList = s.required ?? [];
		return Object.entries(s.properties).map(([k, v]) =>
			renderProperty(ctx, k, v, 0, reqList.includes(k)),
		);
	}
	if (
		s.type === "object" &&
		!s.properties &&
		typeof s.additionalProperties === "object"
	) {
		return [`Map of string to ${describeType(ctx, s.additionalProperties)}.`];
	}
	if (s.type === "object" && !s.properties) {
		return [];
	}
	const variants = s.oneOf ?? s.anyOf;
	if (variants) {
		const out = ["One of:"];
		for (const v of variants) {
			if (v.$ref) {
				const name = refName(v.$ref);
				out.push(`- [${displayOf(ctx, name)}](${urlForSchema(ctx, name)})`);
			}
		}
		return out;
	}
	if (s.allOf) {
		const out: string[] = [];
		for (const piece of s.allOf) {
			if (piece.$ref) {
				const name = refName(piece.$ref);
				out.push(
					`- *everything from [${displayOf(ctx, name)}](${urlForSchema(ctx, name)})*`,
				);
			} else if (piece.type === "object" && piece.properties) {
				const reqList = piece.required ?? [];
				for (const [k, v] of Object.entries(piece.properties)) {
					out.push(renderProperty(ctx, k, v, 0, reqList.includes(k)));
				}
			}
		}
		return out;
	}
	const t = describeType(ctx, s);
	return t ? [t] : [];
}

export function renderOperation(
	ctx: Context,
	entry: Op,
	tagIsWip: boolean,
): string {
	const { path, method, op } = entry;
	const summary = op.summary ?? humanizeOperationId(op.operationId);
	const wip = op["x-wip"] === true;
	const deprecated = op.deprecated === true;
	let headingTitle = withWipSuffix(summary, wip);
	if (deprecated) headingTitle = withDeprecatedSuffix(headingTitle);
	const lines: string[] = [`## ${headingTitle}`, ""];

	if (wip && !tagIsWip) {
		lines.push("> [!NOTE]\n> This endpoint hasn't been researched yet", "");
	}

	if (op["x-wip-note"]) {
		lines.push(`> [!NOTE]\n> ${op["x-wip-note"]}`, "");
	}

	if (op.security && op.security.length) {
		lines.push("Requires [Authorization](/grindr-api/api-authorization).", "");
	}

	if (op.description) lines.push(op.description, "");
	if (op["x-notes"]) for (const n of op["x-notes"]) lines.push(n, "");
	if (op["x-idempotent"])
		lines.push("Repeated requests are completed without errors.", "");
	if (op["x-paid"]) lines.push("Paid feature.", "");

	if (op["x-see-also"]?.length) {
		for (const link of op["x-see-also"])
			lines.push(`See also: [${seeAlsoText(link)}](${link})`);
		lines.push("");
	}

	const resolveForPlaceholder = (name: string): Schema | undefined =>
		ctx.doc.components.schemas[name];
	if (op.requestBody?.content) {
		const bodyJson = op.requestBody.content["application/json"];
		if (
			bodyJson?.schema &&
			isPlaceholderSchema(bodyJson.schema, resolveForPlaceholder)
		) {
			const original = placeholderOriginalType(bodyJson.schema);
			if (original)
				lines.push(`Body type: \`${original}\` (undocumented).`, "");
		}
	}
	const wipSuccessCode = ["200", "201", "202", "204"].find(
		(c) => op.responses?.[c],
	);
	if (wipSuccessCode && op.responses) {
		const wipResp = op.responses[wipSuccessCode];
		const wipJson = wipResp?.content?.["application/json"];
		if (
			wipJson?.schema &&
			isPlaceholderSchema(wipJson.schema, resolveForPlaceholder)
		) {
			const original = placeholderOriginalType(wipJson.schema);
			if (original)
				lines.push(`Response type: \`${original}\` (undocumented).`, "");
		}
	}
	const overrideServer = op.servers?.[0]?.url.replace(/\/$/, "");
	const target = overrideServer ? `${overrideServer}${path}` : path;
	lines.push("```", `${method.toUpperCase()} ${target}`, "```", "");

	const queryGroups = op["x-query-groups"] ?? [];
	const allParams: Parameter[] = [];
	for (const p of op.parameters ?? []) {
		if ("$ref" in p && queryGroups.length) continue;
		const resolved = resolveParam(ctx, p);
		if (resolved) allParams.push(resolved);
	}
	const queryParams = allParams.filter((p) => p.in === "query");
	const headerParams = allParams.filter((p) => p.in === "header");

	function schemaForParam(p: Parameter): Schema {
		const base = p.schema ?? {};
		if (p.description && !base.description) {
			return { ...base, description: p.description };
		}
		return base;
	}

	if (queryParams.length || queryGroups.length) {
		const allOptional =
			!queryGroups.length && queryParams.every((p) => !p.required);
		lines.push(allOptional ? "Query (optional):" : "Query:", "");
		for (const groupName of queryGroups) {
			lines.push(
				`- *everything from [${groupName}](${urlForParamGroup(ctx, groupName)})*`,
			);
		}
		for (const p of queryParams)
			lines.push(
				appendOptional(
					renderProperty(ctx, p.name, schemaForParam(p), 0, !!p.required),
					!p.required,
				),
			);
		lines.push("");
	}

	if (headerParams.length) {
		lines.push("Headers:", "");
		for (const p of headerParams)
			lines.push(
				renderProperty(ctx, p.name, schemaForParam(p), 0, !!p.required),
			);
		lines.push("");
	}

	if (
		op.requestBody?.content &&
		!isPlaceholderBody(
			op.requestBody,
			(name) => ctx.doc.components.schemas[name],
		)
	) {
		const c = op.requestBody.content;
		const json = c["application/json"];
		const binary = c["application/octet-stream"];
		const multipart = c["multipart/form-data"];
		const formUrl = c["application/x-www-form-urlencoded"];
		const optional = op.requestBody.required === false;
		const bodyLabel =
			op["x-body-label"] ?? (optional ? "Body (optional):" : "Body:");
		lines.push(bodyLabel, "");
		if (json) lines.push(...renderBodySchema(ctx, json.schema));
		else if (binary) lines.push("Binary file.");
		else if (multipart) {
			lines.push("Content-Type: `multipart/form-data`", "");
			lines.push(...renderBodySchema(ctx, multipart.schema));
		} else if (formUrl) {
			lines.push("Content-Type: `application/x-www-form-urlencoded`", "");
			lines.push(...renderBodySchema(ctx, formUrl.schema));
		}
		lines.push("");
	}

	const resolveSchemaByName = (name: string): Schema | undefined =>
		ctx.doc.components.schemas[name];

	const successCode = ["200", "201", "202", "204"].find(
		(c) => op.responses?.[c],
	);
	if (successCode && op.responses) {
		const resp = op.responses[successCode];
		if (resp) {
			const json = resp.content?.["application/json"];
			const binary = resp.content?.["application/octet-stream"];
			const images =
				resp.content?.["image/jpeg"] ?? resp.content?.["image/png"];
			const hasMeaningfulDesc =
				!!resp.description && !HTTP_DEFAULT_DESCRIPTIONS.has(resp.description);
			if (json) {
				if (isPlaceholderSchema(json.schema, resolveSchemaByName)) {
					if (hasMeaningfulDesc) {
						lines.push("Response:", "", resp.description!, "");
					}
				} else if (isEmptyObjectSchema(json.schema) && hasMeaningfulDesc) {
					lines.push("Response:", "", resp.description!, "");
				} else {
					lines.push("Response:", "");
					lines.push(...renderBodySchema(ctx, json.schema));
					lines.push("");
				}
			} else if (binary) lines.push("Response:", "", "Binary content.", "");
			else if (images) lines.push("Response:", "", "Image binary.", "");
			else if (hasMeaningfulDesc) {
				lines.push("Response:", "", resp.description!, "");
			}
		}
	}

	const errorEntries = Object.entries(op.responses ?? {})
		.filter(([code]) => /^[45]\d{2}$/.test(code))
		.flatMap(([code, resp]) =>
			resp.description ? [{ code, desc: resp.description }] : [],
		);
	const xErrors = op["x-errors"]
		? Object.entries(op["x-errors"]).map(([k, v]) => ({ code: k, desc: v }))
		: [];
	if (errorEntries.length || xErrors.length) {
		lines.push("Errors:", "");
		for (const e of errorEntries) lines.push(`- \`${e.code}\` — ${e.desc}`);
		for (const e of xErrors) lines.push(`- \`${e.code}\` — ${e.desc}`);
		lines.push("");
	}

	return lines.join("\n").trimEnd() + "\n";
}
