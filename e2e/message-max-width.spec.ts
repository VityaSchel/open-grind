import { expect, type Page, test } from "@playwright/test";

import { installEventInjection, installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const CONVERSATION_ID = "100001:123456000";
const ME = 123456000;
const THEM = 100001;
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const BUBBLE = '[data-slot="message-bubble"]';
const QUOTE = '[data-slot="message-quote"]';
const SCROLLER = '[data-slot="messages-scroller"]';

const BUBBLE_MAX_WIDTH_PX = 400;
const EDGE_GUTTER_PX = 12;
const SPLIT_BREAKPOINT_PX = 560;

const PROSE_LONGER_THAN_ANY_PANE = `Lorem ipsum dolor sit amet consectetur
	adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna
	aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris`
	.replace(/\s+/gu, " ")
	.trim();
const ONE_WORD_WITH_NO_WRAP_OPPORTUNITY = `unbreakable${"x".repeat(140)}token`;

const BREAKPOINTS = [
	{ name: "a small phone", width: 320 },
	{ name: "a phone", width: 390 },
	{ name: "a large phone", width: 480 },
	{ name: "the split boundary", width: SPLIT_BREAKPOINT_PX },
	{ name: "a tablet", width: 768 },
	{ name: "a laptop", width: 1024 },
	{ name: "a desktop", width: 1440 },
];

type RowGeometry = {
	bubbleLeft: number;
	bubbleRight: number;
	bubbleWidth: number;
	rowWidth: number;
	textLeft: number;
	textRight: number;
	quoteLeft: number | null;
	quoteRight: number | null;
	railScrollRange: number;
	railDragSpacerWidth: number;
};

type Geometry = {
	paneLeft: number;
	paneRight: number;
	paneWidth: number;
	paneSidewaysOverflow: number;
	rows: Record<string, RowGeometry>;
};

const CASES = [
	{ marker: "long-in", prose: PROSE_LONGER_THAN_ANY_PANE, fromMe: false },
	{ marker: "long-out", prose: PROSE_LONGER_THAN_ANY_PANE, fromMe: true },
	{
		marker: "word-in",
		prose: ONE_WORD_WITH_NO_WRAP_OPPORTUNITY,
		fromMe: false,
	},
	{
		marker: "word-out",
		prose: ONE_WORD_WITH_NO_WRAP_OPPORTUNITY,
		fromMe: true,
	},
	{
		marker: "quoted-in",
		prose: PROSE_LONGER_THAN_ANY_PANE,
		fromMe: false,
		quoted: PROSE_LONGER_THAN_ANY_PANE,
	},
	{
		marker: "quoted-out",
		prose: PROSE_LONGER_THAN_ANY_PANE,
		fromMe: true,
		quoted: PROSE_LONGER_THAN_ANY_PANE,
	},
].map(({ marker, prose, ...rest }) => ({
	marker,
	text: `${marker} ${prose}`,
	wraps: prose === PROSE_LONGER_THAN_ANY_PANE,
	...rest,
}));

const MARKERS_THAT_WRAP = CASES.filter(({ wraps }) => wraps).map(
	({ marker }) => marker,
);

function message({
	text,
	fromMe,
	timestamp,
	quoted,
}: {
	text: string;
	fromMe: boolean;
	timestamp: number;
	quoted?: string;
}) {
	return {
		type: "Text",
		body: { text },
		messageId: `ws-${timestamp}`,
		conversationId: CONVERSATION_ID,
		senderId: fromMe ? ME : THEM,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage:
			quoted === undefined
				? null
				: {
						type: "Text",
						body: { text: quoted },
						messageId: `ws-quoted-${timestamp}`,
						senderId: THEM,
						unsent: false,
						reactions: [],
						replyToMessage: null,
					},
	};
}

async function deliverOverTheWebsocket(
	page: Page,
	payload: unknown,
): Promise<void> {
	await page.evaluate((body) => {
		window.__emitTauriEvent?.("grindr:chat_v1_message_sent", {
			type: "chat.v1.message_sent",
			notificationId: null,
			ref: null,
			payload: body,
		});
	}, payload);
}

async function openConversation(
	page: Page,
	{ width, platform = "macos" }: { width: number; platform?: string },
): Promise<void> {
	await page.setViewportSize({ width, height: 800 });
	await installTauriShim(page, { platform });
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });

	const alreadyThere = await page.locator(MESSAGE_ROW).count();
	for (const [index, each] of CASES.entries())
		await deliverOverTheWebsocket(
			page,
			message({ ...each, timestamp: Date.now() + index * 1000 }),
		);
	await expect(page.locator(MESSAGE_ROW)).toHaveCount(
		alreadyThere + CASES.length,
	);
	await expect(page.locator(BUBBLE).last()).toBeVisible();
}

function measure(page: Page): Promise<Geometry> {
	return page.evaluate(
		({ scroller, row, bubble, quote, cases }): Geometry => {
			const messages = document.querySelector(scroller);
			if (!messages) throw new Error("the messages scroller is missing");
			const box = messages.getBoundingClientRect();
			const style = getComputedStyle(messages);
			const paneLeft = box.left + parseFloat(style.paddingLeft);
			const paneRight = box.right - parseFloat(style.paddingRight);
			const all = [...document.querySelectorAll(row)];

			const rows: Record<string, RowGeometry> = {};
			for (const { marker, text, quoted } of cases) {
				const found = all.find((each) =>
					(each.textContent ?? "").includes(text),
				);
				if (!found) throw new Error(`the ${marker} row is missing`);
				const speech = found.querySelector(bubble);
				const span = speech?.querySelector(":scope > span");
				if (!speech || !span)
					throw new Error(`the ${marker} bubble is missing`);
				const quoteBox = found.querySelector(quote);
				if (quoted && !quoteBox)
					throw new Error(`the ${marker} quote is missing`);
				const speechBox = speech.getBoundingClientRect();
				const spanBox = span.getBoundingClientRect();
				const quoteRect = quoteBox?.getBoundingClientRect();
				const rail = found.parentElement;
				const spacers = [...(rail?.children ?? [])].filter(
					(child) => child !== found,
				);
				rows[marker] = {
					bubbleLeft: speechBox.left,
					bubbleRight: speechBox.right,
					bubbleWidth: speechBox.width,
					rowWidth: found.getBoundingClientRect().width,
					textLeft: spanBox.left,
					textRight: spanBox.right,
					quoteLeft: quoteRect?.left ?? null,
					quoteRight: quoteRect?.right ?? null,
					railScrollRange: rail
						? rail.scrollWidth - rail.clientWidth
						: Number.NaN,
					railDragSpacerWidth: spacers.reduce(
						(total, spacer) =>
							total + spacer.getBoundingClientRect().width,
						0,
					),
				};
			}
			return {
				paneLeft,
				paneRight,
				paneWidth: paneRight - paneLeft,
				paneSidewaysOverflow:
					messages.scrollWidth -
					(messages as HTMLElement).clientWidth,
				rows,
			};
		},
		{
			scroller: SCROLLER,
			row: MESSAGE_ROW,
			bubble: BUBBLE,
			quote: QUOTE,
			cases: CASES.map(({ marker, text, quoted }) => ({
				marker,
				text,
				quoted: quoted !== undefined,
			})),
		},
	);
}

for (const { name, width } of BREAKPOINTS) {
	test(`a message fits its conversation on ${name} (${width}px)`, async ({
		page,
	}) => {
		await openConversation(page, { width });
		const { paneLeft, paneRight, paneWidth, paneSidewaysOverflow, rows } =
			await measure(page);

		const roomForABubble = Math.min(
			BUBBLE_MAX_WIDTH_PX,
			paneWidth - EDGE_GUTTER_PX * 2,
		);

		for (const [marker, row] of Object.entries(rows)) {
			expect
				.soft(
					row.rowWidth,
					`the ${marker} row is exactly as wide as the conversation, never as wide as its own content`,
				)
				.toBeCloseTo(paneWidth, 0);
			expect
				.soft(
					row.bubbleLeft - paneLeft,
					`the ${marker} bubble starts inside the conversation`,
				)
				.toBeGreaterThanOrEqual(-0.5);
			expect
				.soft(
					paneRight - row.bubbleRight,
					`the ${marker} bubble ends inside the conversation`,
				)
				.toBeGreaterThanOrEqual(-0.5);
			expect
				.soft(
					row.bubbleWidth,
					`the ${marker} bubble never outgrows the room it has`,
				)
				.toBeLessThanOrEqual(roomForABubble + 0.5);
			expect
				.soft(
					row.textLeft - row.bubbleLeft,
					`the ${marker} text starts inside its own bubble`,
				)
				.toBeGreaterThanOrEqual(-0.5);
			expect
				.soft(
					row.bubbleRight - row.textRight,
					`the ${marker} text ends inside its own bubble`,
				)
				.toBeGreaterThanOrEqual(-0.5);

			if (row.quoteLeft === null || row.quoteRight === null) continue;
			expect
				.soft(
					row.quoteLeft - paneLeft,
					`the ${marker} quote starts inside the conversation`,
				)
				.toBeGreaterThanOrEqual(-0.5);
			expect
				.soft(
					paneRight - row.quoteRight,
					`the ${marker} quote ends inside the conversation`,
				)
				.toBeGreaterThanOrEqual(-0.5);
		}

		for (const marker of MARKERS_THAT_WRAP)
			expect
				.soft(
					rows[marker]?.bubbleWidth,
					`the ${marker} bubble spends the whole width it has`,
				)
				.toBeCloseTo(roomForABubble, 0);

		expect(
			paneSidewaysOverflow,
			"the conversation never scrolls sideways to reveal a message",
		).toBeLessThanOrEqual(0);
	});
}

for (const { name, width } of [BREAKPOINTS[0]!, BREAKPOINTS.at(-1)!])
	test(`the reply rail drags exactly its own spacer on ${name} (${width}px)`, async ({
		page,
	}) => {
		await openConversation(page, { width, platform: "linux" });
		const { rows } = await measure(page);
		for (const [marker, row] of Object.entries(rows)) {
			expect
				.soft(
					row.railDragSpacerWidth,
					`the ${marker} rail lays out a drag spacer to scroll across`,
				)
				.toBeGreaterThan(0);
			expect
				.soft(
					row.railScrollRange,
					`the ${marker} rail scrolls one drag's worth, and no further`,
				)
				.toBeCloseTo(row.railDragSpacerWidth, 0);
		}
	});
