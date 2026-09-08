import fs from "node:fs";
import path from "node:path";
import { universalReleaseApk } from "./credits/manual";

const repoRoot = path.resolve(import.meta.dir, "..");
const report = path.join(
	repoRoot,
	"src-tauri/gen/android/app/build/outputs/sdk-dependencies/universalRelease/sdkDependencies.txt",
);

if (!fs.existsSync(report)) {
	console.error(
		`${path.relative(repoRoot, report)} is missing. Build the release APK first; this check only means anything against a real dependency report.`,
	);
	process.exit(1);
}

const declared = new Map<string, string>();
for (const [, group, artifact, version] of fs
	.readFileSync(report, "utf-8")
	.matchAll(
		/groupId:\s*"([^"]+)"\s*artifactId:\s*"([^"]+)"\s*version:\s*"([^"]+)"/g,
	)) {
	declared.set(`${group}:${artifact}`, version!);
}

const isBillOfMaterials = (artifact: string) => artifact.endsWith("-bom");

const platformHalfOf = (coordinate: string) => {
	const [group, artifact] = coordinate.split(":") as [string, string];
	const shared = artifact.replace(/-(jvm|android)$/, "");
	return shared === artifact ? null : `${group}:${shared}`;
};

const packaged = new Map(
	[...declared].filter(([coordinate]) => {
		const artifact = coordinate.split(":")[1]!;
		const shared = platformHalfOf(coordinate);
		return (
			!isBillOfMaterials(artifact) && !(shared && declared.has(shared))
		);
	}),
);

const problems: string[] = [];
for (const [coordinate, version] of packaged) {
	const credited = universalReleaseApk[coordinate];
	if (credited === undefined) {
		problems.push(`${coordinate} ${version} ships but nothing credits it`);
	} else if (credited !== version) {
		problems.push(
			`${coordinate} ships at ${version} but is credited at ${credited}`,
		);
	}
}
for (const coordinate of Object.keys(universalReleaseApk)) {
	if (!packaged.has(coordinate)) {
		problems.push(`${coordinate} is credited but no longer ships`);
	}
}

if (problems.length > 0) {
	console.error(
		`the Android libraries in scripts/credits/manual.ts no longer match the built APK:\n${problems
			.map((it) => `  - ${it}`)
			.join(
				"\n",
			)}\n\nUpdate universalReleaseApk, then run \`bun run gen:credits\` and commit the result.`,
	);
	process.exit(1);
}

console.log(
	`credits cover every Android library in the APK (${packaged.size} of ${declared.size} artifacts; the rest are boms and platform halves)`,
);
