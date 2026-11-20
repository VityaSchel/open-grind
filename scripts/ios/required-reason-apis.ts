const FILE_ATTRIBUTE_LISTS = [
	"getattrlist",
	"getattrlistbulk",
	"fgetattrlist",
	"getattrlistat",
];

export const REQUIRED_REASON_APIS = {
	FileTimestamp: {
		symbols: [
			"stat",
			"fstat",
			"fstatat",
			"lstat",
			...FILE_ATTRIBUTE_LISTS,
			"NSURLContentModificationDateKey",
			"NSURLCreationDateKey",
			"NSFileModificationDate",
			"NSFileCreationDate",
		],
		selectors: ["creationDate", "modificationDate", "fileModificationDate"],
	},
	SystemBootTime: {
		symbols: ["mach_absolute_time"],
		selectors: ["systemUptime"],
	},
	DiskSpace: {
		symbols: [
			"statfs",
			"statvfs",
			"fstatfs",
			"fstatvfs",
			...FILE_ATTRIBUTE_LISTS,
			"NSURLVolumeAvailableCapacityKey",
			"NSURLVolumeAvailableCapacityForImportantUsageKey",
			"NSURLVolumeAvailableCapacityForOpportunisticUsageKey",
			"NSURLVolumeTotalCapacityKey",
			"NSFileSystemFreeSize",
			"NSFileSystemSize",
		],
		selectors: [],
	},
	ActiveKeyboards: { symbols: [], selectors: ["activeInputModes"] },
	UserDefaults: {
		symbols: [],
		selectors: ["standardUserDefaults", "initWithSuiteName:"],
	},
} as const;

export type ApiCategory = keyof typeof REQUIRED_REASON_APIS;

const CATEGORY_PREFIX = "NSPrivacyAccessedAPICategory";

export function importedSymbol(line: string): string {
	return line
		.trim()
		.replace(/^_/, "")
		.replace(/\$INODE64$/, "");
}

export function usedCategories({
	symbols,
	strings,
}: {
	symbols: ReadonlySet<string>;
	strings: ReadonlySet<string>;
}): ApiCategory[] {
	return (Object.keys(REQUIRED_REASON_APIS) as ApiCategory[]).filter(
		(category) => {
			const api = REQUIRED_REASON_APIS[category];
			return (
				api.symbols.some((symbol) => symbols.has(symbol)) ||
				api.selectors.some((selector) => strings.has(selector))
			);
		},
	);
}

type Manifest = {
	NSPrivacyAccessedAPITypes?: {
		NSPrivacyAccessedAPIType?: string;
		NSPrivacyAccessedAPITypeReasons?: string[];
	}[];
};

export function declaredCategories(manifest: Manifest): string[] {
	return (manifest.NSPrivacyAccessedAPITypes ?? [])
		.filter(
			({ NSPrivacyAccessedAPITypeReasons: reasons = [] }) =>
				reasons.length > 0,
		)
		.map(({ NSPrivacyAccessedAPIType: type = "" }) =>
			type.replace(CATEGORY_PREFIX, ""),
		);
}

export function undeclaredCategories({
	used,
	manifest,
}: {
	used: readonly ApiCategory[];
	manifest: Manifest;
}): ApiCategory[] {
	const declared = declaredCategories(manifest);
	return used.filter((category) => !declared.includes(category));
}
