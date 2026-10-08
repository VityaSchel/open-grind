import { NAME, PLURAL_KEY, SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { type Inspection, inspect } from "./message-text";
import { type PluralForms, weblatePluralForms } from "./weblate-plurals";

export type SourceFile = { namespace: string; text: string };

export type Message = {
	key: string;
	params: string[];
	tags: string[];
	wrapped: string[];
};

type Catalog = {
	texts: Map<string, string>;
	objects: Set<string>;
	errors: string[];
};

const baseOf = (key: string) => PLURAL_KEY.exec(key)?.[1] ?? key;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function isCanonicalLocale(locale: string): boolean {
	try {
		return Intl.getCanonicalLocales(locale)[0] === locale;
	} catch {
		return false;
	}
}

function localeDirectoryError(locale: string): string {
	return locale.includes("@")
		? `${locale}: a locale with @ breaks Intl; exclude it with Weblate's language filter`
		: `${locale}: the directory name is not a canonical BCP 47 tag such as pt-BR; set Weblate's language code style to BCP`;
}

function typeName(value: unknown): string {
	if (value === null) return "null";
	return Array.isArray(value) ? "an array" : `a ${typeof value}`;
}

function flatten({
	value,
	key,
	into,
}: {
	value: unknown;
	key: string;
	into: Catalog;
}): void {
	if (typeof value === "string") {
		into.texts.set(key, value);
	} else if (!isRecord(value)) {
		into.errors.push(
			`${key}: must be a string or an object of keys, not ${typeName(value)}`,
		);
	} else {
		into.objects.add(key);
		for (const [segment, child] of Object.entries(value)) {
			if (NAME.test(baseOf(segment))) {
				flatten({ value: child, key: `${key}.${segment}`, into });
			} else {
				into.errors.push(
					`${key}.${segment}: ${segment} is not a camelCase key; write it like sendButton, or photos_one for a plural form`,
				);
			}
		}
	}
}

function readCatalog(files: SourceFile[]): Catalog {
	const catalog: Catalog = {
		texts: new Map(),
		objects: new Set(),
		errors: [],
	};
	for (const { namespace, text } of files) {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch (error) {
			const reason = error instanceof Error ? error.message : error;
			catalog.errors.push(
				`${namespace}.json: is not valid JSON: ${reason}`,
			);
			continue;
		}
		if (isRecord(json)) {
			flatten({ value: json, key: namespace, into: catalog });
		} else {
			catalog.errors.push(`${namespace}.json: must hold a JSON object`);
		}
	}
	return catalog;
}

function groupForms(
	texts: ReadonlyMap<string, string>,
): Map<string, Map<string, string>> {
	const groups = new Map<string, Map<string, string>>();
	for (const [key, text] of texts) {
		const base = baseOf(key);
		const forms = groups.get(base) ?? new Map<string, string>();
		groups.set(base, forms.set(key, text));
	}
	return groups;
}

function describe({
	key,
	forms,
	errors,
}: {
	key: string;
	forms: ReadonlyMap<string, string>;
	errors: string[];
}): Message {
	const plural = !forms.has(key);
	const params = new Set<string>(plural ? ["count"] : []);
	const tags = new Set<string>();
	const wrapped = new Set<string>();
	for (const [form, text] of forms) {
		const found = inspect(text);
		errors.push(...found.problems.map((problem) => `${form}: ${problem}`));
		for (const name of found.params) params.add(name);
		for (const name of found.tags) tags.add(name);
		for (const name of found.wrapped) wrapped.add(name);
		if (
			form === `${key}_one` &&
			found.params.length > 0 &&
			!found.params.includes("count")
		) {
			errors.push(
				`${form}: has a placeholder, so it needs {{count}} as well`,
			);
		}
	}
	if (!plural && params.has("count")) {
		errors.push(
			`${key}: has {{count}}, so split it into ${key}_one and ${key}_other`,
		);
	}
	for (const name of [...tags].filter((tag) => params.has(tag))) {
		errors.push(
			`${key}: <${name}> and {{${name}}} share a name; rename one of them`,
		);
	}
	const sorted = (names: Set<string>) => [...names].sort();
	return {
		key,
		params: sorted(params),
		tags: sorted(tags),
		wrapped: sorted(wrapped),
	};
}

function shapeError({
	key,
	forms,
	objects,
}: {
	key: string;
	forms: ReadonlyMap<string, string>;
	objects: ReadonlySet<string>;
}): string | undefined {
	const suffixes = [...forms.keys()]
		.map((form) => form.slice(key.length + 1))
		.sort();
	if (!forms.has(key)) {
		if (objects.has(key)) {
			return `${key}: is used by both plural forms and nested keys; rename one of them`;
		}
		if (suffixes.join() !== "one,other") {
			return `${key}: English plurals need exactly _one and _other, found _${suffixes.join(", _")}`;
		}
	} else if (forms.size > 1) {
		return `${key}: is used by both a plain value and plural forms; keep one of them`;
	}
	return undefined;
}

export function collectMessages(files: SourceFile[]): {
	messages: Message[];
	errors: string[];
} {
	const named = files.filter(({ namespace }) => NAME.test(namespace));
	const { texts, objects, errors } = readCatalog(named);
	for (const key of objects) {
		if (PLURAL_KEY.test(key)) {
			errors.push(`${key}: holds nested keys, so drop its plural suffix`);
		}
	}
	const fileErrors = files
		.filter((file) => !named.includes(file))
		.map(
			({ namespace }) =>
				`${namespace}.json: ${namespace} is not a camelCase file name such as chat or profileEditor`,
		);
	for (const [key, text] of texts) {
		if (text === "") {
			errors.push(
				`${key}: is empty and would show as the key; write the text`,
			);
		}
	}
	const messages: Message[] = [];
	for (const [key, forms] of groupForms(texts)) {
		const error = shapeError({ key, forms, objects });
		if (error !== undefined) errors.push(error);
		messages.push(describe({ key, forms, errors }));
	}
	return {
		messages: messages.sort((a, b) => (a.key < b.key ? -1 : 1)),
		errors: [...fileErrors, ...errors].map(
			(error) => `${SOURCE_LOCALE}/${error}`,
		),
	};
}

type SourceIndex = {
	inspections: ReadonlyMap<string, Inspection>;
	objects: ReadonlySet<string>;
	pluralBases: ReadonlySet<string>;
	messages: ReadonlyMap<string, Message>;
};

export type TranslationReport = {
	errors: string[];
	warnings: string[];
	translated: number;
	total: number;
};

type Findings = Pick<TranslationReport, "errors" | "warnings">;

type EnglishForm = { message: Message; category?: string };

type DriftContext = {
	locale: string;
	index: SourceIndex;
	plurals: PluralForms;
	partial: ReadonlyMap<string, string[]>;
};

function indexSource(source: SourceFile[]): SourceIndex {
	const { texts, objects } = readCatalog(source);
	const pluralBases = new Set<string>();
	const messages = new Map<string, Message>();
	for (const [key, forms] of groupForms(texts)) {
		if (!forms.has(key)) pluralBases.add(key);
		messages.set(key, describe({ key, forms, errors: [] }));
	}
	const inspections = new Map(
		[...texts].map(([key, text]) => [key, inspect(text)] as const),
	);
	return { inspections, objects, pluralBases, messages };
}

function holdsMessage({
	index,
	path,
}: {
	index: SourceIndex;
	path: string;
}): boolean {
	return (
		index.inspections.has(path) ||
		index.pluralBases.has(path) ||
		index.pluralBases.has(baseOf(path))
	);
}

function formOf({
	index,
	key,
}: {
	index: SourceIndex;
	key: string;
}): EnglishForm | undefined {
	const [, base = "", category] = PLURAL_KEY.exec(key) ?? [];
	const plural = index.pluralBases.has(base)
		? index.messages.get(base)
		: undefined;
	if (plural !== undefined) return { message: plural, category };
	const message = index.inspections.has(key)
		? index.messages.get(key)
		: undefined;
	return message === undefined ? undefined : { message };
}

function completeness({
	index,
	texts,
	plurals,
}: {
	index: SourceIndex;
	texts: ReadonlyMap<string, string>;
	plurals: PluralForms;
}): { translated: number; partial: Map<string, string[]> } {
	let translated = 0;
	const partial = new Map<string, string[]>();
	for (const { key } of index.messages.values()) {
		const suffixes = index.pluralBases.has(key)
			? plurals.offered.map((category) => `_${category}`)
			: [""];
		const missing = suffixes.filter(
			(suffix) => (texts.get(`${key}${suffix}`) ?? "") === "",
		);
		if (missing.length === 0) translated += 1;
		else if (missing.length < suffixes.length) partial.set(key, missing);
	}
	return { translated, partial };
}

function expectedTokens({
	index,
	plurals,
	form: { message, category },
}: {
	index: SourceIndex;
	plurals: PluralForms;
	form: EnglishForm;
}): Pick<Inspection, "params" | "tags"> {
	if (category === undefined) return message;
	const sources = plurals.sourceCategories.get(category) ?? [];
	const english = [...sources].flatMap(
		(source) => index.inspections.get(`${message.key}_${source}`) ?? [],
	);
	const unique = (names: string[]) => [...new Set(names)].sort();
	return {
		params: unique(english.flatMap(({ params }) => params)),
		tags: unique(english.flatMap(({ tags }) => tags)),
	};
}

function reportDrift({
	key,
	text,
	found,
	form,
	context,
	into,
}: {
	key: string;
	text: string;
	found: Inspection;
	form: EnglishForm | undefined;
	context: DriftContext;
	into: Findings;
}): void {
	const { locale, index, plurals, partial } = context;
	if (form === undefined) {
		if (index.objects.has(key)) {
			into.errors.push(
				`${key}: is a string, but English has nested keys here; remove the string`,
			);
		} else {
			into.warnings.push(
				`${key}: English no longer has this key, so nothing shows it`,
			);
		}
		return;
	}
	const { message, category } = form;
	if (category !== undefined && !plurals.offered.includes(category)) {
		into.warnings.push(
			`${key}: Weblate offers no _${category} form for ${locale} and drops it on save`,
		);
	} else if (text === "") {
		if (!partial.has(message.key)) {
			into.warnings.push(`${key}: is empty, so it shows in English`);
		}
	} else {
		const expected = expectedTokens({ index, plurals, form });
		const countOptional =
			category !== undefined && plurals.singleNumber.has(category);
		const lost = [
			...expected.tags
				.filter((tag) => !found.tags.includes(tag))
				.map((tag) => `<${tag}>`),
			...expected.params
				.filter((param) => !found.params.includes(param))
				.filter((param) => !(countOptional && param === "count"))
				.map((param) => `{{${param}}}`),
		];
		into.errors.push(
			...lost.map(
				(token) => `${key}: lacks ${token} from the English message`,
			),
		);
	}
}

function reportAdditions({
	key,
	found,
	english,
	into,
}: {
	key: string;
	found: Inspection;
	english: Message;
	into: Findings;
}): void {
	for (const tag of found.tags) {
		if (!english.tags.includes(tag)) {
			into.errors.push(`${key}: <${tag}> is not in the English message`);
		}
	}
	for (const param of found.params) {
		if (!english.params.includes(param)) {
			into.errors.push(
				`${key}: {{${param}}} is not in the English message`,
			);
		}
	}
	for (const param of found.wrapped) {
		if (
			english.params.includes(param) &&
			!english.wrapped.includes(param)
		) {
			into.errors.push(
				`${key}: move {{${param}}} out of its tag, as in the English message`,
			);
		}
	}
}

export function checkTranslation({
	locale,
	files,
	source,
}: {
	locale: string;
	files: SourceFile[];
	source: SourceFile[];
}): TranslationReport {
	const index = indexSource(source);
	const total = index.messages.size;
	if (!isCanonicalLocale(locale)) {
		return {
			errors: [localeDirectoryError(locale)],
			warnings: [],
			translated: 0,
			total,
		};
	}
	const namespaces = new Set(source.map(({ namespace }) => namespace));
	const known = files.filter(({ namespace }) => namespaces.has(namespace));
	const { texts, objects, errors } = readCatalog(known);
	const findings: Findings = {
		errors: [
			...files
				.filter((file) => !known.includes(file))
				.map(
					({ namespace }) =>
						`${namespace}.json: has no English en/${namespace}.json; rename or remove it`,
				),
			...errors,
		],
		warnings: [],
	};
	for (const path of objects) {
		if (holdsMessage({ index, path })) {
			findings.errors.push(
				`${path}: is an object, but English has a message here; remove the object`,
			);
		}
	}
	const plurals = weblatePluralForms(locale);
	const { translated, partial } = completeness({ index, texts, plurals });
	for (const [base, missing] of partial) {
		findings.warnings.push(
			`${base}: has no text for ${missing.join(", ")}, so those counts show in English`,
		);
	}
	const context = { locale, index, plurals, partial };
	for (const [key, text] of texts) {
		const found = inspect(text);
		findings.errors.push(
			...found.problems.map((problem) => `${key}: ${problem}`),
		);
		const form = formOf({ index, key });
		if (form !== undefined) {
			reportAdditions({
				key,
				found,
				english: form.message,
				into: findings,
			});
		}
		reportDrift({ key, text, found, form, context, into: findings });
	}
	const scoped = (line: string) => `${locale}/${line}`;
	return {
		errors: findings.errors.map(scoped),
		warnings: findings.warnings.map(scoped).sort(),
		translated,
		total,
	};
}
