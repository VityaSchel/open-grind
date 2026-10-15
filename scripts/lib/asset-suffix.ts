export type Artifact = "apk" | "deb" | "AppImage" | "exe" | "zip";

export const ARTIFACTS: Artifact[] = ["apk", "deb", "AppImage", "exe", "zip"];

export const ANDROID_SPLITS = {
	aarch64: { flavor: "arm64", abi: "arm64-v8a" },
	armv7: { flavor: "arm", abi: "armeabi-v7a" },
	i686: { flavor: "x86", abi: "x86" },
	x86_64: { flavor: "x86_64", abi: "x86_64" },
} as const;

export type AndroidTarget = keyof typeof ANDROID_SPLITS;

export function isAndroidTarget(value: string): value is AndroidTarget {
	return Object.hasOwn(ANDROID_SPLITS, value);
}

export function androidSplitSuffix(target: AndroidTarget): string {
	return `-android-${ANDROID_SPLITS[target].abi}.apk`;
}

export function isArtifact(value: string): value is Artifact {
	return (ARTIFACTS as string[]).includes(value);
}

export function assetSuffix(artifact: Artifact): string {
	const arch = process.arch === "arm64" ? "arm64" : "x86_64";
	switch (artifact) {
		case "apk":
			return androidSplitSuffix("aarch64");
		case "zip":
			return "-macos.zip";
		case "exe":
			return `-windows-${arch}.exe`;
		case "deb":
			return `-linux-${arch}.deb`;
		case "AppImage":
			return `-linux-${arch}.AppImage`;
	}
}
