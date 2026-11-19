import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiResponseMessageSchema } from "#lib/model/messaging/messages.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import Message from "./Message.svelte";

const EXPIRING_PHOTO = '[data-slot="expiring-image-message"]';

function renderExpiringPhoto({
	onReply,
	onReact,
}: {
	onReply: () => void;
	onReact?: (reactionId: number) => void;
}) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: "100001:100002",
				senderId: 100002,
				timestamp: 1_700_000_000_000,
				type: "ExpiringImage",
				body: {
					mediaId: 900_003,
					url: "https://cdns.grindr.com/images/chat/expiring.jpg",
					width: 96,
					height: 96,
					duration: 10_000,
					viewsRemaining: 1,
					expiresAt: null,
					viewed: false,
				},
			}),
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
			onReply,
			onReact,
		},
	});
}

function expiringPhoto(container: HTMLElement): HTMLElement {
	const photo = container.querySelector<HTMLElement>(EXPIRING_PHOTO);
	if (photo === null) throw new Error("Missing expiring photo");
	return photo;
}

beforeEach(() => {
	runningOn("windows");
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetPlatform();
});

describe("expiring photo message", () => {
	it("leaves a double click on the photo out of replying to the message", async () => {
		const onReply = vi.fn();
		const { container } = renderExpiringPhoto({ onReply });

		await fireEvent.dblClick(expiringPhoto(container));

		expect(onReply).not.toHaveBeenCalled();
	});

	it("still reacts to a double tap on the photo", () => {
		runningOn("android");
		const onReply = vi.fn();
		const onReact = vi.fn();
		const { container } = renderExpiringPhoto({ onReply, onReact });
		const photo = expiringPhoto(container);

		for (let tap = 0; tap < 2; tap += 1) {
			photo.dispatchEvent(pointerEvent("pointerdown"));
			photo.dispatchEvent(pointerEvent("pointerup"));
		}
		photo.dispatchEvent(
			new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
		);

		expect(onReact).toHaveBeenCalledExactlyOnceWith(1);
		expect(onReply).not.toHaveBeenCalled();
	});
});
