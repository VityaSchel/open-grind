import { isRecord, type Message } from "./source-messages";

export type NativeManifestCheck = {
	manifest: Map<string, string>;
	errors: string[];
};

export type NativeTarget = {
	readonly file: string;
	readonly names: string;
	readonly example: string;
	readonly shows: string;
	readonly nameProblem: (name: string) => string | undefined;
};

type Entry = { readonly error: string } | { readonly key: string };

function readEntry({
	name,
	key,
	messages,
	target,
}: {
	name: string;
	key: unknown;
	messages: ReadonlyMap<string, Message>;
	target: NativeTarget;
}): Entry {
	const problem = target.nameProblem(name);
	if (problem !== undefined) return { error: problem };
	if (typeof key !== "string") {
		return {
			error: `${JSON.stringify(key)} is not a message key such as "chat.notification.you"`,
		};
	}
	const message = messages.get(key);
	if (message === undefined) {
		return {
			error: `${key} is not a message in locales/en; fix the key or add the message`,
		};
	}
	if (message.params.includes("count")) {
		return {
			error: `${key} is a plural group, which is not supported until a native plural exists; map a message without {{count}}`,
		};
	}
	if (message.tags.length > 0) {
		return {
			error: `${key} has <${message.tags.join(">, <")}>, which ${target.shows} cannot show; map a message without tags`,
		};
	}
	return { key };
}

export function checkNativeManifest({
	text,
	messages,
	target,
}: {
	text: string;
	messages: readonly Message[];
	target: NativeTarget;
}): NativeManifestCheck {
	const result: NativeManifestCheck = { manifest: new Map(), errors: [] };
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : error;
		result.errors.push(`${target.file}: is not valid JSON: ${reason}`);
		return result;
	}
	if (!isRecord(json)) {
		result.errors.push(
			`${target.file}: must hold an object of ${target.names} and message keys, such as {${target.example}}`,
		);
		return result;
	}
	const byKey = new Map(messages.map((message) => [message.key, message]));
	for (const [name, key] of Object.entries(json)) {
		const entry = readEntry({ name, key, messages: byKey, target });
		if ("error" in entry) {
			result.errors.push(`${target.file}: ${name}: ${entry.error}`);
		} else {
			result.manifest.set(name, entry.key);
		}
	}
	return result;
}
