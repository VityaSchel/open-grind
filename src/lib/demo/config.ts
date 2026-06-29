import { env } from "$env/dynamic/public";

export const demoEnabled = env.PUBLIC_ENABLE_DEMO && !("VITEST" in import.meta);

export const demoMeProfileId = 123456000;

export const NOW = Date.now();
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEMO_PROFILE_COUNT = 3000;
export const DEMO_ID_START = demoMeProfileId + 1;
export const GRID_PAGE_SIZE = 60;
