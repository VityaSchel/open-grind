type NpmOverride = {
	spdx?: string;
	textFiles?: string[];
	versions: string[];
	source: string;
};

const tauriPlugin = (versions: string[]): NpmOverride => ({
	textFiles: ["tauri-plugins-mit.txt", "apache-2.0.txt"],
	versions,
	source: "crates.io tauri-plugin-fs-2.5.1 LICENSE_MIT and LICENSE_APACHE-2.0, identical across the six plugin crates at the shipped versions; the npm tarballs carry only LICENSE.spdx",
});

const embla: NpmOverride = {
	textFiles: ["embla-carousel-license.txt"],
	versions: ["8.6.0"],
	source: "https://raw.githubusercontent.com/davidjerleke/embla-carousel/v8.6.0/LICENSE; the tarballs carry no license file",
};

const verbatimMit = (versions: string[]): NpmOverride => ({
	spdx: "MIT",
	versions,
	source: "no license field; the shipped LICENSE is the verbatim MIT text (md5 3460c324e040c506d90c2b0be3628039), the same file runed >= 0.28.0 declares as MIT",
});

export const npmOverrides: Record<string, NpmOverride> = {
	"@tauri-apps/plugin-clipboard-manager": tauriPlugin(["2.3.2"]),
	"@tauri-apps/plugin-dialog": tauriPlugin(["2.7.1"]),
	"@tauri-apps/plugin-fs": tauriPlugin(["2.5.1"]),
	"@tauri-apps/plugin-geolocation": tauriPlugin(["2.3.2"]),
	"@tauri-apps/plugin-opener": tauriPlugin(["2.5.4"]),
	"@tauri-apps/plugin-os": tauriPlugin(["2.3.2"]),
	"embla-carousel": embla,
	"embla-carousel-reactive-utils": embla,
	"embla-carousel-svelte": embla,
	runed: verbatimMit(["0.23.4"]),
	"svelte-toolbelt": verbatimMit(["0.7.1", "0.9.3", "0.10.6"]),
};

export const cssImportsCreditedElsewhere = ["shadcn-svelte"];
