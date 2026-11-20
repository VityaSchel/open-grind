import { $ } from "bun";

import { XCRUN } from "../lib/xcrun";
import {
	importedSymbol,
	undeclaredCategories,
	usedCategories,
} from "./required-reason-apis";

export const IPA_APP = "Payload/Open Grind.app";
const BINARY = `${IPA_APP}/Open Grind`;
const MANIFEST = `${IPA_APP}/PrivacyInfo.xcprivacy`;
const FALSE_INFO_PLIST_KEYS = [
	"ITSAppUsesNonExemptEncryption",
	"MKSellsDigitalGoods",
];

const lines = (output: string) => output.split("\n").filter(Boolean);

async function infoPlistValue({
	ipa,
	key,
}: {
	ipa: string;
	key: string;
}): Promise<string> {
	const read =
		await $`unzip -p ${ipa} ${`${IPA_APP}/Info.plist`} | plutil -extract ${key} raw -o - -`
			.nothrow()
			.quiet();
	return read.stdout.toString().trim();
}

async function requireDeclaredReasons(ipa: string): Promise<void> {
	const into = (await $`mktemp -d`.text()).trim();
	try {
		await $`unzip -q ${ipa} ${BINARY} ${MANIFEST} -d ${into}`;
		const symbols = new Set(
			lines(await $`${XCRUN} nm -u ${`${into}/${BINARY}`}`.text()).map(
				importedSymbol,
			),
		);
		const strings = new Set(
			lines(await $`${XCRUN} strings -a ${`${into}/${BINARY}`}`.text()),
		);
		const manifest = JSON.parse(
			await $`plutil -convert json -o - ${`${into}/${MANIFEST}`}`.text(),
		);
		const missing = undeclaredCategories({
			used: usedCategories({ symbols, strings }),
			manifest,
		});
		if (missing.length > 0) {
			throw new Error(
				`${ipa} uses required-reason APIs that PrivacyInfo.xcprivacy does not declare: ${missing.join(", ")}`,
			);
		}
	} finally {
		await $`rm -rf ${into}`;
	}
}

export async function verifyIpa({
	ipa,
	bundleVersion,
}: {
	ipa: string;
	bundleVersion: string;
}): Promise<void> {
	const listing = lines(
		(await $`unzip -Z1 ${ipa}`.quiet()).stdout.toString(),
	);
	if (!listing.includes(MANIFEST)) {
		throw new Error(`${ipa} carries no PrivacyInfo.xcprivacy`);
	}
	for (const key of FALSE_INFO_PLIST_KEYS) {
		if ((await infoPlistValue({ ipa, key })) !== "false") {
			throw new Error(`${ipa} must set ${key} to false`);
		}
	}
	const built = await infoPlistValue({ ipa, key: "CFBundleVersion" });
	if (built !== bundleVersion) {
		throw new Error(
			`${ipa} has CFBundleVersion ${built}, expected ${bundleVersion}`,
		);
	}
	await requireDeclaredReasons(ipa);
}
