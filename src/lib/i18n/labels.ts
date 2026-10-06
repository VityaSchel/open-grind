import { t } from "./index";
import type { PlainMessageKey } from "./types";

export type TranslatedLabels<Keys> = { readonly [Id in keyof Keys]: string };

export function translatedLabels<
	const Keys extends Readonly<Record<number, PlainMessageKey>>,
>(keys: Keys): TranslatedLabels<Keys> {
	const translate: (key: PlainMessageKey) => string = t;
	const labels = {};
	for (const [id, key] of Object.entries<PlainMessageKey>(keys)) {
		Object.defineProperty(labels, id, {
			enumerable: true,
			get: () => translate(key),
		});
	}
	return labels as TranslatedLabels<Keys>;
}
