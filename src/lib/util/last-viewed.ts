import z from "zod";

const storedTimestampSchema = z.coerce.number().int().nonnegative();

export function lastViewedMarker(prefix: string) {
	const keyFor = (profileId: number) => `${prefix}${profileId}`;

	return {
		load(profileId: number): number {
			if (typeof localStorage === "undefined") return 0;
			return (
				storedTimestampSchema.safeParse(
					localStorage.getItem(keyFor(profileId)),
				).data ?? 0
			);
		},

		save({ profileId, at }: { profileId: number; at: number }): void {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(keyFor(profileId), String(at));
		},

		clearStored(): void {
			if (typeof localStorage === "undefined") return;
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith(prefix)) localStorage.removeItem(key);
			}
		},
	};
}
