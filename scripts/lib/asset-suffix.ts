export type Artifact = "apk" | "deb" | "AppImage" | "exe" | "zip";

export const ARTIFACTS: Artifact[] = ["apk", "deb", "AppImage", "exe", "zip"];

export function isArtifact(value: string): value is Artifact {
	return (ARTIFACTS as string[]).includes(value);
}

export function assetSuffix(artifact: Artifact): string {
	const arch = process.arch === "arm64" ? "arm64" : "x86_64";
	switch (artifact) {
		case "apk":
			return "-android.apk";
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
