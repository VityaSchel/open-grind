const LANGUAGE_TAG = 0xe0001;
const CANCEL_TAG = 0xe007f;
const TAG_OFFSET = 0xe0000;
const FIRST_KEY_CHARACTER = 0x20;
const LAST_KEY_CHARACTER = 0x7e;

const OPENING = String.fromCodePoint(LANGUAGE_TAG);
const CLOSING = String.fromCodePoint(LANGUAGE_TAG, CANCEL_TAG);
const CANCEL = String.fromCodePoint(CANCEL_TAG);

const MARKER =
	/\u{E0001}([\u{E0020}-\u{E007E}]*)\u{E007F}|\u{E0001}[\u{E0020}-\u{E007E}]*\uDB40?|\uDB40/gu;

export interface MarkerSpan {
	key: string;
	text: string;
	closed: boolean;
}

export interface MarkedRun {
	text: string;
	spans: readonly MarkerSpan[];
}

function encodeKey(key: string): string {
	const codes = Array.from(key, (character) => character.codePointAt(0) ?? 0);
	if (
		codes.length === 0 ||
		codes.some(
			(code) => code < FIRST_KEY_CHARACTER || code > LAST_KEY_CHARACTER,
		)
	) {
		throw new RangeError(`Can't mark the message key "${key}"`);
	}
	return String.fromCodePoint(...codes.map((code) => TAG_OFFSET + code));
}

function decodeKey(tags: string): string {
	return String.fromCodePoint(
		...Array.from(tags, (tag) => (tag.codePointAt(0) ?? 0) - TAG_OFFSET),
	);
}

export function markMessage({
	key,
	message,
}: {
	key: string;
	message: string;
}): string {
	return `${OPENING}${encodeKey(key)}${CANCEL}${message}${CLOSING}`;
}

export function stripMarkers(text: string): string {
	return text.replace(MARKER, "");
}

export class MarkerReader {
	readonly spans: MarkerSpan[] = [];
	readonly #open: MarkerSpan[] = [];

	read(chunk: string): MarkedRun[] {
		const runs: MarkedRun[] = [];
		const appendText = (text: string) => {
			if (text === "") return;
			for (const span of this.#open) span.text += text;
			runs.push({ text, spans: [...this.#open] });
		};
		let end = 0;
		for (const match of chunk.matchAll(MARKER)) {
			appendText(chunk.slice(end, match.index));
			end = match.index + match[0].length;
			const [, tags] = match;
			if (tags === "") this.#close();
			else if (tags !== undefined) this.#openSpan(decodeKey(tags));
		}
		appendText(chunk.slice(end));
		return runs;
	}

	#openSpan(key: string): void {
		const span = { key, text: "", closed: false };
		this.spans.push(span);
		this.#open.push(span);
	}

	#close(): void {
		const span = this.#open.pop();
		if (span !== undefined) span.closed = true;
	}
}

export function decodeMarkers(text: string): MarkerSpan[] {
	const reader = new MarkerReader();
	reader.read(text);
	return reader.spans;
}
