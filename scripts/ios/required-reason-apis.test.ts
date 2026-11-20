import { describe, expect, it } from "vitest";

import {
	declaredCategories,
	importedSymbol,
	undeclaredCategories,
	usedCategories,
} from "./required-reason-apis";

const none = new Set<string>();

const manifestDeclaring = (categories: Record<string, string[]>) => ({
	NSPrivacyAccessedAPITypes: Object.entries(categories).map(
		([category, reasons]) => ({
			NSPrivacyAccessedAPIType: `NSPrivacyAccessedAPICategory${category}`,
			NSPrivacyAccessedAPITypeReasons: reasons,
		}),
	),
});

describe("importedSymbol", () => {
	it("drops the C underscore and the 64-bit inode suffix", () => {
		expect(importedSymbol("_stat")).toBe("stat");
		expect(importedSymbol("_fstat$INODE64\n")).toBe("fstat");
		expect(importedSymbol("_NSURLCreationDateKey")).toBe(
			"NSURLCreationDateKey",
		);
	});
});

describe("usedCategories", () => {
	it("finds file timestamps through an imported stat", () => {
		expect(
			usedCategories({ symbols: new Set(["stat"]), strings: none }),
		).toEqual(["FileTimestamp"]);
	});

	it("finds user defaults through its selector", () => {
		expect(
			usedCategories({
				symbols: none,
				strings: new Set(["standardUserDefaults"]),
			}),
		).toEqual(["UserDefaults"]);
	});

	it("counts getattrlist toward both file timestamps and disk space", () => {
		expect(
			usedCategories({
				symbols: new Set(["getattrlist"]),
				strings: none,
			}),
		).toEqual(["FileTimestamp", "DiskSpace"]);
	});

	it("finds nothing in a binary that uses none of them", () => {
		expect(
			usedCategories({
				symbols: new Set([
					"clock_gettime",
					"NSURLIsExcludedFromBackupKey",
				]),
				strings: new Set(["objectForKey:"]),
			}),
		).toEqual([]);
	});
});

describe("undeclaredCategories", () => {
	it("passes when every used category has a reason", () => {
		expect(
			undeclaredCategories({
				used: ["FileTimestamp", "UserDefaults"],
				manifest: manifestDeclaring({
					FileTimestamp: ["C617.1"],
					UserDefaults: ["CA92.1"],
				}),
			}),
		).toEqual([]);
	});

	it("names a used category the manifest leaves out", () => {
		expect(
			undeclaredCategories({
				used: ["FileTimestamp", "SystemBootTime"],
				manifest: manifestDeclaring({ FileTimestamp: ["C617.1"] }),
			}),
		).toEqual(["SystemBootTime"]);
	});

	it("does not count a category declared with no reason", () => {
		expect(
			declaredCategories(manifestDeclaring({ UserDefaults: [] })),
		).toEqual([]);
	});
});
