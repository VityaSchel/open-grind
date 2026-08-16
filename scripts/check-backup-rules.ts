// An unrecognized domain or a `..`/`//` path is dropped silently, and a section
// left with no rules reverts to backing up everything:
// https://android.googlesource.com/platform/frameworks/base/+/HEAD/core/java/android/app/backup/FullBackup.java#722
import { readFileSync } from "fs";
import { join } from "path";

const RULES =
	"src-tauri/gen/android/app/src/main/res/xml/data_extraction_rules.xml";

const SECTIONS = ["cloud-backup", "device-transfer", "cross-platform-transfer"];

const DOMAINS = [
	"file",
	"database",
	"root",
	"sharedpref",
	"external",
	"device_file",
	"device_database",
	"device_root",
	"device_sharedpref",
];

const fail = (message: string): never => {
	console.error(`\x1b[31merror\x1b[0m: ${RULES}: ${message}`);
	process.exit(1);
};

const xml = readFileSync(join(import.meta.dir, "..", RULES), "utf8");

for (const section of SECTIONS) {
	const body =
		new RegExp(`<${section}\\b[^>]*>([\\s\\S]*?)</${section}>`).exec(
			xml,
		)?.[1] ?? "";

	const rules = [...body.matchAll(/<(include|exclude)\b([^>]*)\/>/g)];
	if (!rules.length) {
		fail(`<${section}> holds no rules, so Android backs up everything`);
	}

	for (const [, kind = "", attributes = ""] of rules) {
		if (kind === "exclude") {
			fail(`<${section}> mixes an exclude into an allow-list`);
		}
		const domain = /domain="([^"]*)"/.exec(attributes)?.[1];
		if (!domain || !DOMAINS.includes(domain)) {
			fail(`<${section}> has unrecognized domain "${domain ?? ""}"`);
		}
		const path = /path="([^"]*)"/.exec(attributes)?.[1];
		if (!path || path.includes("..") || path.includes("//")) {
			fail(`<${section}> has a path Android drops: "${path ?? ""}"`);
		}
	}
}

console.log(`${RULES}: ${SECTIONS.length} sections allow-list only`);
