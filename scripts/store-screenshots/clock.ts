import type { Page } from "@playwright/test";

const CAPTURED_AT = Date.parse("2026-07-21T13:12:00Z");
const RELEASE_EVENT = "store-screenshots:release-clock";
const STOP_EVENT = "store-screenshots:stop-clock";

export async function freezeClockOnEveryLoad(page: Page): Promise<void> {
	await page.addInitScript(
		({ capturedAt, releaseEvent, stopEvent }) => {
			const SystemDate = Date;
			let offset: number | null = null;
			let stoppedAt: number | null = null;
			const now = () =>
				stoppedAt ??
				(offset === null ? capturedAt : SystemDate.now() + offset);
			addEventListener(
				releaseEvent,
				() => {
					offset = capturedAt - SystemDate.now();
				},
				{ once: true },
			);
			addEventListener(
				stopEvent,
				() => {
					stoppedAt = now();
				},
				{ once: true },
			);
			class CapturedDate extends SystemDate {
				constructor(
					...args: [] | ConstructorParameters<DateConstructor>
				) {
					if (args.length === 0) super(now());
					else super(...args);
				}

				static override now(): number {
					return now();
				}
			}
			globalThis.Date = CapturedDate as DateConstructor;
		},
		{
			capturedAt: CAPTURED_AT,
			releaseEvent: RELEASE_EVENT,
			stopEvent: STOP_EVENT,
		},
	);
}

async function dispatchClockEvent({
	page,
	event,
}: {
	page: Page;
	event: string;
}): Promise<void> {
	await page.evaluate((name) => dispatchEvent(new Event(name)), event);
}

export function releaseClock(page: Page): Promise<void> {
	return dispatchClockEvent({ page, event: RELEASE_EVENT });
}

export function stopClock(page: Page): Promise<void> {
	return dispatchClockEvent({ page, event: STOP_EVENT });
}
