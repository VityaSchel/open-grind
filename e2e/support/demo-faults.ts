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

export type DemoRequest = { path: string; at: number };

type RecordingWindow = Window & { __demoRequests: DemoRequest[] };

export async function recordDemoRequests(
	page: Page,
): Promise<() => Promise<DemoRequest[]>> {
	await page.addInitScript(() => {
		const requests: DemoRequest[] = [];
		Object.assign(window, {
			__demoRequests: requests,
			__demoFault: ({ path }: { path: string }) => {
				requests.push({ path, at: performance.now() });
				return undefined;
			},
		});
	});
	await routeDemoThroughFaultHook(page);
	return () =>
		page.evaluate(() => [
			...(window as unknown as RecordingWindow).__demoRequests,
		]);
}

export async function holdDemoRequests(
	page: Page,
	{ pathPrefix }: { pathPrefix: string },
): Promise<void> {
	await page.addInitScript((prefix) => {
		Object.assign(window, {
			__demoFault: ({ path }: { path: string }) =>
				path.startsWith(prefix) ? new Promise(() => {}) : undefined,
		});
	}, pathPrefix);
	await routeDemoThroughFaultHook(page);
}

type DemoAnswer = { answering: boolean; hits: number };
type AnsweringWindow = Window & { __demoAnswer: DemoAnswer };

export async function answerDemoRequests(
	page: Page,
	answer: { pathPrefix: string; status: number; body: unknown },
): Promise<{ start: () => Promise<void>; hits: () => Promise<number> }> {
	await page.addInitScript(({ pathPrefix, status, body }) => {
		const state: DemoAnswer = { answering: false, hits: 0 };
		Object.assign(window, {
			__demoAnswer: state,
			__demoFault: ({ path }: { path: string }) => {
				if (!state.answering || !path.startsWith(pathPrefix))
					return undefined;
				state.hits += 1;
				return { status, body };
			},
		});
	}, answer);
	await routeDemoThroughFaultHook(page);
	return {
		start: () =>
			page.evaluate(() => {
				(window as unknown as AnsweringWindow).__demoAnswer.answering =
					true;
			}),
		hits: () =>
			page.evaluate(
				() => (window as unknown as AnsweringWindow).__demoAnswer.hits,
			),
	};
}

export async function failDemoRequests(
	page: Page,
	{
		pathPrefix,
		times,
		status,
	}: { pathPrefix: string; times: number; status: number },
): Promise<void> {
	await page.addInitScript(
		([prefix, failures, failWith]) => {
			let remaining = failures;
			Object.assign(window, {
				__demoFault: ({ path }: { path: string }) => {
					if (!path.startsWith(prefix) || remaining === 0)
						return undefined;
					remaining -= 1;
					return { status: failWith, body: { message: "Failed" } };
				},
			});
		},
		[pathPrefix, times, status] as const,
	);
	await routeDemoThroughFaultHook(page);
}
