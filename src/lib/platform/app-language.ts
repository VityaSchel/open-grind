import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	getLocale,
	offersLanguage,
	resolveLanguage,
	setLocale,
} from "$lib/i18n";
import { normalizeTag } from "$lib/i18n/matcher";
import { everyLanguageOffered } from "$lib/i18n/offered";
import {
	LANGUAGE_SYNC_TIERS,
	type LanguagePlan,
	type LanguageSettings,
	type LanguageSyncTier,
	planLanguageChoice,
	reconcileLanguage,
} from "./language-sync";
import { NATIVE_READ_TIMEOUT_MS } from "./regional-settings";

const READ_COMMAND = "app_languages";
const WRITE_COMMAND = "set_app_language";
const CHANGED_EVENT = "app-language-changed";

type AppLanguages = {
	readonly tier: LanguageSyncTier;
	readonly app: string | null;
	readonly system: readonly string[];
};

const systemLanguagesSchema = z.object({
	system: z
		.array(z.unknown())
		.transform((tags) =>
			tags.filter((tag): tag is string => typeof tag === "string"),
		),
});

const nativeSyncSchema = z.object({
	tier: z.enum(LANGUAGE_SYNC_TIERS),
	app: z.string().nullable(),
});

const NOTHING_SEEN: AppLanguages = { tier: "none", app: null, system: [] };

let current = NOTHING_SEEN;
let followsBrowser = true;
let queue: Promise<unknown> = Promise.resolve();
let stopFollowing = (): void => {};

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task);
	queue = run.catch(() => undefined);
	return run;
}

function appLanguages(value: unknown): AppLanguages | undefined {
	const languages = systemLanguagesSchema.safeParse(value);
	if (!languages.success) return undefined;
	const { system } = languages.data;
	const sync = nativeSyncSchema.safeParse(value);
	if (!sync.success) return { tier: "none", app: null, system };
	const { tier, app } = sync.data;
	return {
		tier,
		app: app === null ? null : (normalizeTag(app) ?? app),
		system,
	};
}

function browserLanguages(): AppLanguages {
	const system =
		navigator.languages.length > 0
			? navigator.languages
			: [navigator.language];
	return { tier: "none", app: null, system: [...system] };
}

async function storedSettings(): Promise<LanguageSettings | undefined> {
	try {
		const { language, languageSync } = await getPreferences();
		return { language, languageSync };
	} catch {
		return undefined;
	}
}

function sameSettings(a: LanguageSettings, b: LanguageSettings): boolean {
	return (
		a.language === b.language &&
		(a.languageSync === null) === (b.languageSync === null) &&
		a.languageSync?.native === b.languageSync?.native
	);
}

async function showLanguage(choice: string | null): Promise<void> {
	const { locale } = resolveLanguage({ choice, system: current.system });
	if (locale !== getLocale()) await setLocale({ locale });
}

async function writeNative(plan: LanguagePlan): Promise<boolean> {
	if (plan.write === null) return true;
	try {
		await invoke(WRITE_COMMAND, { tag: plan.write.tag });
		current = { ...current, app: plan.write.tag };
		return true;
	} catch (error) {
		console.error("Failed to set the app language", error);
		return false;
	}
}

async function sync(languages: AppLanguages): Promise<void> {
	current = languages;
	const stored = await storedSettings();
	const plan = reconcileLanguage({
		language: stored?.language ?? null,
		languageSync: stored?.languageSync ?? null,
		tier: languages.tier,
		native: languages.app,
		isOffered: offersLanguage,
	});
	const written = await writeNative(plan);
	const languageSync = written
		? plan.languageSync
		: { native: languages.app };
	const settled = { language: plan.language, languageSync };
	if (stored !== undefined && !sameSettings(stored, settled)) {
		await setPreferences(settled).catch(console.error);
	}
	await showLanguage(settled.language);
}

function followBrowserChange(): void {
	if (!followsBrowser) return;
	void enqueue(async () => {
		current = browserLanguages();
		const stored = await storedSettings();
		if ((stored?.language ?? null) === null) await showLanguage(null);
	}).catch(console.error);
}

function followNative(languages: AppLanguages): Promise<void> {
	followsBrowser = false;
	return enqueue(() => sync(languages));
}

async function startNative(): Promise<void> {
	let reported = false;
	const listening = listen<unknown>(CHANGED_EVENT, ({ payload }) => {
		const languages = appLanguages(payload);
		if (languages === undefined) return;
		reported = true;
		void followNative(languages).catch(console.error);
	});
	listening.catch(console.error);
	const stopBrowser = stopFollowing;
	stopFollowing = () => {
		stopBrowser();
		void listening.then((unlisten) => unlisten()).catch(() => {});
	};
	const unlessReported = (languages: AppLanguages) =>
		enqueue(() => (reported ? Promise.resolve() : sync(languages)));
	const read = invoke<unknown>(READ_COMMAND).then(appLanguages, (error) => {
		console.error("Failed to read the app languages", error);
		return undefined;
	});
	const first = await Promise.race([
		read,
		new Promise<"late">((resolve) =>
			setTimeout(() => resolve("late"), NATIVE_READ_TIMEOUT_MS),
		),
	]);
	if (first === "late") {
		void read
			.then((languages) => {
				if (languages === undefined) return;
				followsBrowser = false;
				return unlessReported(languages);
			})
			.catch(console.error);
	}
	if (first === "late" || first === undefined) {
		await unlessReported(browserLanguages());
		return;
	}
	followsBrowser = false;
	await unlessReported(first);
}

function pinnedLanguage(): string | undefined {
	if (!everyLanguageOffered) return undefined;
	const tag = new URLSearchParams(location.search).get("locale");
	return tag !== null && offersLanguage(tag) ? tag : undefined;
}

export async function startLanguage(): Promise<void> {
	stopFollowing();
	stopFollowing = () => {};
	current = NOTHING_SEEN;
	followsBrowser = true;
	try {
		const pinned = pinnedLanguage();
		if (pinned !== undefined) {
			await setLocale({ locale: pinned });
			return;
		}
		window.addEventListener("languagechange", followBrowserChange);
		stopFollowing = () =>
			window.removeEventListener("languagechange", followBrowserChange);
		if (isTauri()) {
			await startNative();
		} else {
			await enqueue(() => sync(browserLanguages()));
		}
	} catch (error) {
		console.error("Failed to start the interface language", error);
	}
}

export function chooseLanguage({ tag }: { tag: string }): Promise<void> {
	return enqueue(async () => {
		if (!offersLanguage(tag)) {
			throw new RangeError(`No translations for language "${tag}"`);
		}
		const { languageSync } = await getPreferences();
		const plan = planLanguageChoice({
			tier: current.tier,
			tag,
			languageSync,
		});
		const shown = getLocale();
		await showLanguage(plan.language);
		try {
			await setPreferences({
				language: plan.language,
				languageSync: plan.languageSync,
			});
		} catch (error) {
			await setLocale({ locale: shown }).catch(console.error);
			throw error;
		}
		if (!(await writeNative(plan))) {
			await setPreferences({
				languageSync: { native: current.app },
			}).catch(console.error);
		}
	});
}
