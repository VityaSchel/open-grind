import z from "zod";

const reportedDrops = new Set<string>();

function warnOnceOnDrop({ label, reason }: { label: string; reason: string }) {
	const key = `${label}: ${reason}`;
	if (reportedDrops.has(key)) return;
	reportedDrops.add(key);
	console.warn(
		`[${label}] dropped ${reason}; it is not documented in docs/lib/openapi.json`,
	);
}

function discriminatorValuesOf({
	variant,
	discriminator,
}: {
	variant: z.ZodObject;
	discriminator: string;
}): unknown[] {
	const field = variant.shape[discriminator];
	if (!(field instanceof z.ZodLiteral)) {
		throw new Error(
			`arrayOfKnownVariants expects "${discriminator}" to be a literal on every variant`,
		);
	}
	return [...field.values];
}

function describeIssues(
	issues: readonly { path?: readonly PropertyKey[] }[],
): string {
	const paths = issues.map(({ path }) =>
		path === undefined || path.length === 0 ? "(root)" : path.join("."),
	);
	return [...new Set(paths)].join(", ");
}

function dropReason({
	entry,
	discriminator,
	knownVariants,
}: {
	entry: unknown;
	discriminator: string;
	knownVariants: ReadonlySet<unknown>;
}): string | null {
	if (typeof entry !== "object" || entry === null) {
		return "an entry that is not an object";
	}
	const variant = (entry as Record<string, unknown>)[discriminator];
	if (variant === undefined || variant === null) {
		return `an entry with no "${discriminator}"`;
	}
	if (!knownVariants.has(variant)) {
		return `an entry typed ${JSON.stringify(variant)}`;
	}
	return null;
}

export function arrayOfKnownVariants<
	Variants extends z.ZodDiscriminatedUnion<readonly z.ZodObject[]>,
>({ variants, label }: { variants: Variants; label: string }) {
	const discriminator = variants.def.discriminator;
	const knownVariants = new Set<unknown>(
		variants.options.flatMap((variant) =>
			discriminatorValuesOf({ variant, discriminator }),
		),
	);

	function isKnown(entry: unknown): boolean {
		const reason = dropReason({ entry, discriminator, knownVariants });
		if (reason === null) return true;
		warnOnceOnDrop({ label, reason });
		return false;
	}

	return z.preprocess(
		(entries) =>
			Array.isArray(entries) ? entries.filter(isKnown) : entries,
		z.array(variants),
	);
}

export function knownValueOr<Value extends z.ZodType>({
	value,
	fallback,
	label,
}: {
	value: Value;
	fallback: z.output<Value>;
	label: string;
}) {
	return value.catch(({ value: received }) => {
		if (received !== undefined) {
			warnOnceOnDrop({
				label,
				reason: `the value ${JSON.stringify(received)}`,
			});
		}
		return fallback;
	});
}

export function knownValueOrNull<Value extends z.ZodType>({
	value,
	label,
}: {
	value: Value;
	label: string;
}) {
	return knownValueOr({ value: value.nullable(), fallback: null, label });
}

export function arrayOfParsableEntries<Entry extends z.ZodType>({
	entries,
	label,
}: {
	entries: Entry;
	label: string;
}) {
	const parsableEntry = entries.nullable().catch(({ issues }) => {
		warnOnceOnDrop({
			label,
			reason: `an entry that did not match the modeled shape at ${describeIssues(issues)}`,
		});
		return null;
	});
	return z
		.array(parsableEntry)
		.transform((parsed) =>
			parsed.filter((entry): entry is z.output<Entry> => entry !== null),
		);
}

export function serverDefault<Value extends z.ZodType>({
	value,
	fallback,
}: {
	value: Value;
	fallback: z.output<Value>;
}) {
	return value.nullish().transform((parsed) => parsed ?? fallback);
}
