import { defineEnvVars } from "@sveltejs/kit/env";

const flag = (value: string | undefined) => Boolean(value);
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	PUBLIC_BACKDROP_BLUR: { public: true, schema: optional },
	PUBLIC_ENABLE_BLUR_EFFECTS: { public: true, static: true, schema: flag },
	PUBLIC_TEST_INSETS: { public: true, static: true, schema: flag },
});
