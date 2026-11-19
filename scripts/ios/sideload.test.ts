import { describe, expect, it } from "vitest";

import {
	IPHONEOS_SDK_BUILD,
	pathLeaks,
	sideloadInfoPlist,
	XCODE_BUILD,
} from "./sideload";

const built = {
	BuildMachineOSBuild: "26A434",
	CFBundleVersion: "12000",
	DTSDKBuild: IPHONEOS_SDK_BUILD,
	DTXcodeBuild: XCODE_BUILD,
};

describe("sideloadInfoPlist", () => {
	it("drops the build machine's macOS build and keeps every other key", () => {
		expect(sideloadInfoPlist(built)).toEqual({
			CFBundleVersion: "12000",
			DTSDKBuild: IPHONEOS_SDK_BUILD,
			DTXcodeBuild: XCODE_BUILD,
		});
	});

	it("refuses an app built with another Xcode", () => {
		expect(() =>
			sideloadInfoPlist({ ...built, DTXcodeBuild: "27A5218g" }),
		).toThrow(`DTXcodeBuild is 27A5218g, expected ${XCODE_BUILD}`);
	});

	it("refuses an app built against another iOS SDK", () => {
		expect(() =>
			sideloadInfoPlist({ ...built, DTSDKBuild: "23E5200" }),
		).toThrow(`DTSDKBuild is 23E5200, expected ${IPHONEOS_SDK_BUILD}`);
	});

	it("refuses an app whose Info.plist names no toolchain", () => {
		expect(() => sideloadInfoPlist({ CFBundleVersion: "12000" })).toThrow(
			"DTXcodeBuild is undefined",
		);
	});
});

describe("pathLeaks", () => {
	it("returns every string that contains one of the paths", () => {
		expect(
			pathLeaks({
				strings: [
					"/cargo/registry/src/boring-sys2/err.c",
					"/Users/someone/.cargo/registry/src/x.rs",
					"called `Option::unwrap()`",
					"/build/out/DerivedData/x.o",
				],
				paths: ["/Users/", "DerivedData"],
			}),
		).toEqual([
			"/Users/someone/.cargo/registry/src/x.rs",
			"/build/out/DerivedData/x.o",
		]);
	});

	it("returns nothing for remapped paths", () => {
		expect(
			pathLeaks({
				strings: [
					"/open-grind/src-tauri/src/lib.rs",
					"/cargo/registry",
				],
				paths: ["/Users/", "/var/folders/"],
			}),
		).toEqual([]);
	});
});
