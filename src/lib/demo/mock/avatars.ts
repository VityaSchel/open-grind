import { hashString } from "$lib/util/random";

export const demoBaseAvatarUrl =
	"https://api.dicebear.com/10.x/lorelei/svg?beardProbability=7&rotate=0&hairVariant=variant01:1,variant02:1,variant03:1,variant04:1,variant05:1,variant06:1,variant07:1,variant08:1,variant09:1,variant10:0.5,variant11:1,variant12:1,variant17:0.5,variant18:0.5,variant20:1,variant22:1,variant25:1,variant27:1,variant28:1,variant29:0.5,variant31:0.5,variant32:0.5,variant33:0.5,variant34:1,variant35:0.5,variant36:1,variant37:0.5,variant39:1,variant43:1,variant44:1,variant47:1&eyesVariant=variant01,variant02,variant03,variant04,variant05,variant06,variant07,variant08,variant09,variant10,variant12,variant13,variant14,variant15,variant16,variant17,variant18,variant19,variant20,variant21,variant22,variant24";

const demoGradients = [
	["141e30", "35577d"],
	["0f2027", "203a43"],
	["232526", "414345"],
	["3a1c71", "1e0a3c"],
	["16222a", "3a6073"],
	["42275a", "1a1423"],
] as const;

const demoMediaSeeds = new Map<string, string>();

export function picsum({
	seed,
	width = 600,
	height = 800,
}: {
	seed: string;
	width?: number;
	height?: number;
}): string {
	return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

export function hashFromSeed(seed: string): string {
	let state = hashString(seed);
	let out = "";
	while (out.length < 40) {
		state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
		state = (state ^ (state >>> 13)) >>> 0;
		out += state.toString(16).padStart(8, "0");
	}
	return out.slice(0, 40);
}

export function registerPhoto(seed: string): string {
	const hash = hashFromSeed(seed);
	demoMediaSeeds.set(hash, seed);
	return hash;
}

export function demoMediaUrl(mediaHash: string): string;
export function demoMediaUrl(
	mediaHash: string | null | undefined,
): string | null;
export function demoMediaUrl(
	mediaHash: string | null | undefined,
): string | null {
	if (!mediaHash) return null;
	const seed = demoMediaSeeds.get(mediaHash) ?? mediaHash;
	const profileId = Number.parseInt(seed, 10) || 0;
	const [from, to] =
		demoGradients[profileId % demoGradients.length] ?? demoGradients[0];
	const rotation = (profileId * 53) % 360;
	return (
		`${demoBaseAvatarUrl}` +
		`&backgroundType=gradientLinear&backgroundColor=${from},${to}` +
		`&backgroundRotation=${rotation}&seed=${encodeURIComponent(seed)}`
	);
}
