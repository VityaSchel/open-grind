import { parseVersion } from "./semver";

export type Occurrence = { file: string; literal: string };

function bundleShortVersion(version: string): string {
	const parsed = parseVersion(version);
	if (!parsed) throw new Error(`${version} is not a valid semver version`);
	return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function versionOccurrences({
	version,
	code,
}: {
	version: string;
	code: number;
}): Occurrence[] {
	const shortVersion = bundleShortVersion(version);
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
