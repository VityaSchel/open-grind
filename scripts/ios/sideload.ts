import type { PlistDictionary } from "./plist-xml";

export const XCODE_BUILD = "27A266a";
export const IPHONEOS_SDK_BUILD = "24A430";

const TOOLCHAIN_PINS = {
	DTXcodeBuild: XCODE_BUILD,
	DTSDKBuild: IPHONEOS_SDK_BUILD,
};
const HOST_KEYS = ["BuildMachineOSBuild"];

export function sideloadInfoPlist(info: PlistDictionary): PlistDictionary {
	const unpinned = Object.entries(TOOLCHAIN_PINS)
		.filter(([key, pinned]) => info[key] !== pinned)
		.map(([key, pinned]) => `${key} is ${info[key]}, expected ${pinned}`);
	if (unpinned.length > 0) {
		throw new Error(
			`the app was built with an unpinned toolchain: ${unpinned.join(", ")}`,
		);
	}
	return Object.fromEntries(
		Object.entries(info).filter(([key]) => !HOST_KEYS.includes(key)),
	);
}

export function pathLeaks({
	strings,
	paths,
}: {
	strings: string[];
	paths: string[];
}): string[] {
	return strings.filter((line) => paths.some((path) => line.includes(path)));
}
