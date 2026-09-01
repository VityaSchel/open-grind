import type { IconifyInfo, IconifyJSON } from "@iconify/types";
import { encodeSvgForCss, getIconData, iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils";
import type { Plugin } from "vite";

type IconSpec = {
	/** Iconify id, `prefix:name`, https://icon-sets.iconify.design */
	icon: string;
	license?: { spdx: string; url: string };
};

const FEATURES: Record<string, IconSpec> = {
	"i-grid": { icon: "lucide:layout-grid" },
	"i-teleport": { icon: "lucide:map-pin" },
	"i-no-ads": { icon: "lucide:megaphone-off" },
	"i-platforms": { icon: "lucide:monitor-smartphone" },
	"i-privacy": { icon: "lucide:eye-off" },
	"i-security": { icon: "lucide:shield-check" },
};

const ACTIONS: Record<string, IconSpec> = {
	"i-download": { icon: "lucide:download" },
	"i-chat": { icon: "lucide:messages-square" },
	"i-forgejo": {
		icon: "simple-icons:forgejo",
		license: {
			spdx: "CC-BY-SA-4.0",
			url: "https://codeberg.org/forgejo/meta/src/branch/readme/branding/README.md#logo",
		},
	},
};

const PLATFORMS: Record<string, IconSpec> = {
	"i-android": {
		icon: "simple-icons:android",
		license: {
			spdx: "CC-BY-3.0",
			url: "https://developer.android.com/distribute/marketing-tools/brand-guidelines#brand-android",
		},
	},
	"i-windows": { icon: "simple-icons:windows" },
	"i-linux": { icon: "simple-icons:linux" },
	"i-apple": { icon: "simple-icons:apple" },
};

const SECTIONS: Array<[string, Record<string, IconSpec>]> = [
	["Features", FEATURES],
	["Hero actions", ACTIONS],
	["Platforms", PLATFORMS],
];

const HEADER = `/*! Icon licenses. Every rule below names its source as \`prefix:name\`.
 *
 * Lucide — ISC License, Copyright (c) 2026 Lucide Icons and Contributors.
 *   Permission to use, copy, modify, and/or distribute this software for any purpose with or
 *   without fee is hereby granted, provided that the above copyright notice and this permission
 *   notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
 *   WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *   AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
 *   CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 *   WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 *   CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * lucide:download only — MIT License, Copyright (c) 2013-present Cole Bemis.
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 *   and associated documentation files (the "Software"), to deal in the Software without
 *   restriction, including without limitation the rights to use, copy, modify, merge, publish,
 *   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 *   Software is furnished to do so, subject to the following conditions: The above copyright
 *   notice and this permission notice shall be included in all copies or substantial portions of
 *   the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 *   PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 *   LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 *   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 *   DEALINGS IN THE SOFTWARE.
 *
 * simple-icons:forgejo — Forgejo logo by the Forgejo project, CC-BY-SA-4.0; this recoloured copy
 *   is offered under the same license.
 * simple-icons:android — Android robot by Google, CC-BY-3.0.
 * The remaining Simple Icons marks are CC0-1.0 and require no notice.
 */`;

const VIRTUAL_ID = "virtual:icons.css";

async function loadSet(prefix: string) {
	const [icons, info, pkg] = await Promise.all([
		import(`@iconify-json/${prefix}/icons.json`, { with: { type: "json" } }),
		import(`@iconify-json/${prefix}/info.json`, { with: { type: "json" } }),
		import(`@iconify-json/${prefix}/package.json`, { with: { type: "json" } }),
	]);
	return {
		icons: icons.default as IconifyJSON,
		info: info.default as IconifyInfo,
		pkgVersion: pkg.default.version as string,
	};
}

function rule(className: string, { icon, license }: IconSpec, sets: Map<string, Awaited<ReturnType<typeof loadSet>>>) {
	const [prefix, name] = icon.split(":");
	const set = sets.get(prefix);
	if (!set) throw new Error(`${icon}: @iconify-json/${prefix} is not installed`);

	const data = getIconData(set.icons, name);
	if (!data) throw new Error(`${icon} is not in @iconify-json/${prefix}`);

	const { attributes, body } = iconToSVG(data);
	const svg = iconToHTML(replaceIDs(body), attributes).replace(/currentColor/g, "black");

	const { info, pkgVersion } = set;
	const version = info.version ? `set ${info.version}` : `@iconify-json/${prefix} ${pkgVersion}`;
	const { spdx, url } = license ?? { spdx: info.license.spdx, url: info.license.url };
	const comment = `/*! ${icon} · ${info.name} by ${info.author.name} · ${spdx} · ${url} · ${version} */`;

	return `${comment}\n.${className} {\n\t--icon: url("data:image/svg+xml,${encodeSvgForCss(svg)}");\n}`;
}

async function generate() {
	const prefixes = [...new Set(SECTIONS.flatMap(([, specs]) => Object.values(specs).map((s) => s.icon.split(":")[0])))];
	const sets = new Map(await Promise.all(prefixes.map(async (p) => [p, await loadSet(p)] as const)));

	const sections = SECTIONS.map(([title, specs]) => {
		const rules = Object.entries(specs).map(([className, spec]) => rule(className, spec, sets));
		return `/* ${title} */\n\n${rules.join("\n\n")}`;
	});
	return `${[HEADER, ...sections].join("\n\n")}\n`;
}

export function icons(): Plugin {
	return {
		name: "open-grind:icons",
		resolveId: (id) => (id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : undefined),
		load: (id) => (id === `\0${VIRTUAL_ID}` ? generate() : undefined),
	};
}
