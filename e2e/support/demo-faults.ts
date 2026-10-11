import type { Page } from "@playwright/test";

const TRANSPORT_MODULE = /\/src\/lib\/api\/transport\.ts(\?.*)?$/;
const DEMO_RESPONSE = "const { status, body } = demoRoute({";
const FAULTY_DEMO_RESPONSE =
	"const { status, body } = (await globalThis.__demoFault?.({ path, method })) ?? demoRoute({";

export async function routeDemoThroughFaultHook(page: Page): Promise<void> {
	await page.route(TRANSPORT_MODULE, async (route) => {
		const response = await route.fetch();
		const source = await response.text();
		if (!source.includes(DEMO_RESPONSE))
			throw new Error(
				"the demo transport no longer has the fault hook seam",
			);
		await route.fulfill({
			response,
			body: source.replace(DEMO_RESPONSE, FAULTY_DEMO_RESPONSE),
		});
	});
}
