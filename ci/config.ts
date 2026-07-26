export const FORGEJO = "https://git.opengrind.org";
export const REPO = "open-grind/open-grind";
export const RUNNER_VERSION = "12.13.2";
export const RUNNER_SHA256 =
	"2b4c3751fc2f9a60f753ef97414949de25587dfa2b921870b0cb6cb7c9bf7080";
export const STATE_BUCKET = "open-grind-ci-state";
export const BOX_LIFETIME_MINUTES = 90;
export const SSH_KEY = "open-grind-ci";

export interface Box {
	name: string;
	provider: "cherry" | "digitalocean" | "hetzner" | "scaleway" | "vultr";
	plans: string[];
	locations: string[];
}

export const BUILDERS: Box[] = [
	{
		name: "open-grind-builder-1-cherry",
		provider: "cherry",
		plans: ["G1-8-32gb-200nv-ded"],
		locations: ["LT-Siauliai", "NL-Amsterdam", "US-Chicago", "SG-Singapore"],
	},
	{
		name: "open-grind-builder-2-vultr",
		provider: "vultr",
		plans: ["vhp-8c-16gb-amd"],
		locations: ["ams", "fra", "cdg", "waw", "ewr", "ord", "dfw", "lax", "sgp"],
	},
	{
		name: "open-grind-builder-3-hetzner",
		provider: "hetzner",
		plans: ["cx43", "cpx42"],
		locations: ["fsn1", "nbg1", "hel1"],
	},
];

export const CHECK_LABEL = "open-grind-check";
export const CHECK: Omit<Box, "name"> = {
	provider: "hetzner",
	plans: ["cx43", "cx53", "cpx42"],
	locations: ["fsn1", "nbg1", "hel1"],
};

export const WARM_LABEL = "open-grind-warm";
export const WARM: Omit<Box, "name"> = {
	provider: "hetzner",
	plans: ["cx43", "cx53", "cpx42"],
	locations: CHECK.locations,
};

export const EPHEMERAL_PREFIXES = [`${CHECK_LABEL}-`, `${WARM_LABEL}-`];
