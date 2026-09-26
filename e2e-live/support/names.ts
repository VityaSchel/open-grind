import { randomUUID } from "node:crypto";

export const liveNamePrefix = "og-e2e-";

export function uniqueLiveName(label: string) {
	return `${liveNamePrefix}${label}-${randomUUID().slice(0, 8)}`;
}
