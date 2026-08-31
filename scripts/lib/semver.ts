const pattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export type Version = {
	major: number;
	minor: number;
	patch: number;
	prerelease: string;
};

export function parseVersion(version: string): Version | null {
	const parsed = pattern.exec(version);
	if (!parsed) return null;
	const [, major, minor, patch, prerelease = ""] = parsed;
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		prerelease,
	};
}
