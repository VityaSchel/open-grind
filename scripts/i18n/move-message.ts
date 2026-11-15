import { NAME, PLURAL_KEY, SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { isRecord } from "./source-messages";

export type LocaleFile = { locale: string; namespace: string; text: string };

type Tree = Record<string, unknown>;

type Entry = [name: string, value: unknown];

type MessagePath = { namespace: string; parents: string[]; leaf: string };

type ParsedFile = LocaleFile & { tree: Tree };

const serialize = (tree: Tree) => `${JSON.stringify(tree, null, "\t")}\n`;

const without = ({
	tree,
	names,
}: {
	tree: Tree;
	names: readonly string[];
}): Tree =>
	Object.fromEntries(
		Object.entries(tree).filter(([name]) => !names.includes(name)),
	);

function parseKey(key: string): MessagePath {
	const segments = key.split(".");
	const [namespace = "", ...parents] = segments;
	const leaf = parents.pop();
	const pluralBase = PLURAL_KEY.exec(key)?.[1];
	const invalid = segments.find((segment) => !NAME.test(segment));
	if (leaf === undefined) {
		throw new Error(
			`${key} is not a full key; write the file name and the path, as in common.actions.close`,
		);
	}
	if (pluralBase !== undefined) {
		throw new Error(
			`${key} is one plural form; pass ${pluralBase} to move all its forms`,
		);
	}
	if (invalid === "") {
		throw new Error(`${key} has an empty part; remove the extra dot`);
	}
	if (invalid !== undefined) {
		throw new Error(
			`${key} is not a valid key; "${invalid}" is not camelCase`,
		);
	}
	return { namespace, parents, leaf };
}

function parseFile(file: LocaleFile): ParsedFile {
	const name = `${file.locale}/${file.namespace}.json`;
	let tree: unknown;
	try {
		tree = JSON.parse(file.text);
	} catch {
		throw new Error(`${name} is not valid JSON`);
	}
	if (!isRecord(tree)) throw new Error(`${name} does not hold a JSON object`);
	return { ...file, tree };
}

function objectAt({
	tree,
	path,
}: {
	tree: Tree;
	path: readonly string[];
}): Tree | undefined {
	let node: unknown = tree;
	for (const segment of path) {
		node = isRecord(node) ? node[segment] : undefined;
	}
	return isRecord(node) ? node : undefined;
}

function formNames({
	parent,
	leaf,
}: {
	parent: Tree | undefined;
	leaf: string;
}): string[] {
	return Object.entries(parent ?? {})
		.filter(
			([name, value]) =>
				typeof value === "string" &&
				(name === leaf || PLURAL_KEY.exec(name)?.[1] === leaf),
		)
		.map(([name]) => name);
}

function messageAbove({
	tree,
	target: { namespace, parents },
}: {
	tree: Tree;
	target: MessagePath;
}): string | undefined {
	const depth = parents.findIndex(
		(segment, index) =>
			formNames({
				parent: objectAt({ tree, path: parents.slice(0, index) }),
				leaf: segment,
			}).length > 0,
	);
	return depth === -1
		? undefined
		: [namespace, ...parents.slice(0, depth + 1)].join(".");
}

function isTaken({
	tree,
	target: { parents, leaf },
}: {
	tree: Tree;
	target: MessagePath;
}): boolean {
	const parent = objectAt({ tree, path: parents });
	return (
		formNames({ parent, leaf }).length > 0 || parent?.[leaf] !== undefined
	);
}

function insertBefore({
	tree,
	entries,
	anchor,
}: {
	tree: Tree;
	entries: Entry[];
	anchor: string | undefined;
}): Tree {
	const current = Object.entries(tree);
	const index = current.findIndex(([name]) => name === anchor);
	current.splice(index === -1 ? current.length : index, 0, ...entries);
	return Object.fromEntries(current);
}

function insertMessage({
	tree,
	parents,
	entries,
	anchor,
}: {
	tree: Tree;
	parents: readonly string[];
	entries: Entry[];
	anchor: readonly string[];
}): Tree {
	const [segment, ...rest] = parents;
	const child = segment === undefined ? undefined : tree[segment];
	if (segment === undefined || !isRecord(child)) {
		const branch = parents.reduceRight<Entry[]>(
			(inner, name) => [[name, Object.fromEntries(inner)]],
			entries,
		);
		return insertBefore({ tree, entries: branch, anchor: anchor[0] });
	}
	const inner = anchor[0] === segment ? anchor.slice(1) : [];
	return {
		...tree,
		[segment]: insertMessage({
			tree: child,
			parents: rest,
			entries,
			anchor: inner,
		}),
	};
}

function removeForms({
	tree,
	parents,
	forms,
}: {
	tree: Tree;
	parents: readonly string[];
	forms: readonly string[];
}): Tree {
	const [segment, ...rest] = parents;
	if (segment === undefined) return without({ tree, names: forms });
	const child = removeForms({
		tree: objectAt({ tree, path: [segment] }) ?? {},
		parents: rest,
		forms,
	});
	return Object.keys(child).length === 0
		? without({ tree, names: [segment] })
		: { ...tree, [segment]: child };
}

function locate({
	files,
	source,
}: {
	files: readonly ParsedFile[];
	source: MessagePath;
}): { origin: ParsedFile; parent: Tree; forms: string[] } | undefined {
	const origin = files.find(
		({ namespace }) => namespace === source.namespace,
	);
	const parent =
		origin && objectAt({ tree: origin.tree, path: source.parents });
	const forms = formNames({ parent, leaf: source.leaf });
	return origin === undefined || parent === undefined || forms.length === 0
		? undefined
		: { origin, parent, forms };
}

function moveInLocale({
	files,
	source,
	target,
}: {
	files: readonly ParsedFile[];
	source: MessagePath;
	target: MessagePath;
}): LocaleFile[] {
	const located = locate({ files, source });
	if (located === undefined) return [];
	const { origin, parent, forms } = located;
	const { locale } = origin;
	const entries = forms.map((name): Entry => {
		const suffix = name.slice(source.leaf.length);
		return [`${target.leaf}${suffix}`, parent[name]];
	});
	const remove = (tree: Tree) =>
		removeForms({ tree, parents: source.parents, forms });
	const sameFile = source.namespace === target.namespace;
	const destination = sameFile
		? origin.tree
		: (files.find(({ namespace }) => namespace === target.namespace)
				?.tree ?? {});
	const moved = insertMessage({
		tree: destination,
		parents: target.parents,
		entries,
		anchor: sameFile ? [...source.parents, ...forms.slice(0, 1)] : [],
	});
	if (sameFile) {
		return [
			{
				locale,
				namespace: target.namespace,
				text: serialize(remove(moved)),
			},
		];
	}
	return [
		{
			locale,
			namespace: source.namespace,
			text: serialize(remove(origin.tree)),
		},
		{ locale, namespace: target.namespace, text: serialize(moved) },
	];
}

export function moveMessage({
	files,
	from,
	to,
}: {
	files: readonly LocaleFile[];
	from: string;
	to: string;
}): LocaleFile[] {
	const source = parseKey(from);
	const target = parseKey(to);
	const namespaces = new Set([source.namespace, target.namespace]);
	const parsed = files
		.filter(({ namespace }) => namespaces.has(namespace))
		.map((file) => parseFile(file));
	const english = parsed.filter(({ locale }) => locale === SOURCE_LOCALE);
	if (locate({ files: english, source }) === undefined) {
		throw new Error(`${from} does not exist in ${SOURCE_LOCALE}`);
	}
	for (const { locale, namespace, tree } of parsed) {
		if (namespace !== target.namespace) continue;
		const message = messageAbove({ tree, target });
		if (message !== undefined) {
			throw new Error(
				message === from
					? `${to} would sit inside ${from} itself; rename ${from} to a temporary key first, then to ${to}`
					: `${to} would sit inside the message ${message} in ${locale}`,
			);
		}
		if (isTaken({ tree, target })) {
			throw new Error(`${to} already exists in ${locale}`);
		}
	}
	return [...Map.groupBy(parsed, ({ locale }) => locale).values()].flatMap(
		(locale) => moveInLocale({ files: locale, source, target }),
	);
}

export function renameLiterals({
	text,
	from,
	to,
}: {
	text: string;
	from: string;
	to: string;
}): string {
	const literal = new RegExp(`(["'\`])${RegExp.escape(from)}\\1`, "g");
	return text.replace(
		literal,
		(_match, quote: string) => `${quote}${to}${quote}`,
	);
}
