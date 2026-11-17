import { requireVersion } from "./semver";

export type Occurrence = { file: string; literal: string };

export function versionOccurrences({
	version,
	code,
}: {
	version: string;
	code: number;
}): Occurrence[] {
	const { major, minor, patch } = requireVersion(version);
	const shortVersion = `${major}.${minor}.${patch}`;
	return [
		{ file: "package.json", literal: `"version": "${version}"` },
		{ file: "src-tauri/Cargo.toml", literal: `\nversion = "${version}"\n` },
		{
			file: "src-tauri/tauri.conf.json",
			literal: `"version": "${version}"`,
		},
		{
			file: "src-tauri/tauri.conf.json",
			literal: `"versionCode": ${code}`,
		},
		{
			file: "src-tauri/tauri.ios.conf.json",
			literal: `"bundleVersion": "${code}"`,
		},
		{
			file: "src-tauri/gen/apple/project.yml",
			literal: `CFBundleShortVersionString: ${shortVersion}\n`,
		},
		{
			file: "src-tauri/gen/apple/project.yml",
			literal: `CFBundleVersion: "${code}"\n`,
		},
		{
			file: "src-tauri/gen/apple/open-grind_iOS/Info.plist",
			literal: `<key>CFBundleShortVersionString</key>\n\t<string>${shortVersion}</string>`,
		},
		{
			file: "src-tauri/gen/apple/open-grind_iOS/Info.plist",
			literal: `<key>CFBundleVersion</key>\n\t<string>${code}</string>`,
		},
		{
			file: "src-tauri/Cargo.lock",
			literal: `name = "open-grind"\nversion = "${version}"`,
		},
	];
}
