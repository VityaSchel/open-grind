import { describe, expect, it } from "vitest";

import { plistXml } from "./plist-xml";

const document = (body: string) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${body}
</plist>
`;

describe("plistXml", () => {
	it("writes dictionary keys in code point order whatever order they came in", () => {
		expect(plistXml({ b: "2", a: "1", B: "0" })).toBe(
			document(`<dict>
	<key>B</key>
	<string>0</string>
	<key>a</key>
	<string>1</string>
	<key>b</key>
	<string>2</string>
</dict>`),
		);
	});

	it("writes booleans, integers, reals, nested arrays and empty containers", () => {
		expect(
			plistXml({
				flag: false,
				family: [1],
				scale: 1.5,
				scene: { multiple: true },
				none: [],
				empty: {},
			}),
		).toBe(
			document(`<dict>
	<key>empty</key>
	<dict/>
	<key>family</key>
	<array>
		<integer>1</integer>
	</array>
	<key>flag</key>
	<false/>
	<key>none</key>
	<array/>
	<key>scale</key>
	<real>1.5</real>
	<key>scene</key>
	<dict>
		<key>multiple</key>
		<true/>
	</dict>
</dict>`),
		);
	});

	it("escapes markup in keys and strings", () => {
		expect(plistXml({ "a<b": "Tom & <Jerry>" })).toBe(
			document(`<dict>
	<key>a&lt;b</key>
	<string>Tom &amp; &lt;Jerry&gt;</string>
</dict>`),
		);
	});
});
