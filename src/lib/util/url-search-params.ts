import z from "zod";

type StringRecord = Record<string, string>;

function valuesToStringRecord(data: Record<string, unknown>): StringRecord {
	const result: StringRecord = {};
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "boolean") result[key] = value ? "true" : "false";
		else if (Array.isArray(value))
			result[key] = value.map(String).join(",");
		else if (typeof value === "number" || typeof value === "string")
			result[key] = String(value);
	}
	return result;
}

function stringRecordToValues<T extends z.ZodObject>({
	schema,
	record,
}: {
	schema: T;
	record: StringRecord;
}): Record<string, unknown> {
	const shape = schema.shape;
	const result: Record<string, unknown> = {};
	for (const [key, fieldSchema] of Object.entries(shape)) {
		const raw = record[key];
		if (raw === undefined) continue;
		const inner = unwrapSchema(fieldSchema as z.ZodType);
		if (inner instanceof z.ZodNumber) {
			result[key] = Number(raw);
		} else if (inner instanceof z.ZodBoolean) {
			result[key] = raw === "true" || raw === "1";
		} else if (inner instanceof z.ZodBigInt) {
			result[key] = BigInt(raw);
		} else if (inner instanceof z.ZodArray) {
			const element = unwrapSchema(inner.element as z.ZodType);
			result[key] =
				raw === ""
					? []
					: raw.split(",").map((value) => {
							if (element instanceof z.ZodNumber)
								return Number(value);
							if (element instanceof z.ZodBoolean)
								return value === "true" || value === "1";
							if (element instanceof z.ZodBigInt)
								return BigInt(value);
							return value;
						});
		} else {
			result[key] = raw;
		}
	}
	return result;
}

function unwrapSchema(s: z.ZodType): z.ZodType {
	if (s instanceof z.ZodOptional || s instanceof z.ZodNullable)
		return unwrapSchema(s.unwrap() as z.ZodType);
	if (s instanceof z.ZodDefault) return unwrapSchema(s.unwrap() as z.ZodType);
	return s;
}

export function urlSearchParamsCodec<T extends z.ZodObject>(schema: T) {
	return z.codec(z.instanceof(URLSearchParams), schema, {
		decode(params: URLSearchParams) {
			const record: StringRecord = {};
			for (const [key, value] of params) record[key] = value;
			const coerced = stringRecordToValues({ schema, record });
			return coerced as z.input<T>;
		},
		encode(data: z.input<T>) {
			return new URLSearchParams(valuesToStringRecord(data));
		},
	});
}
