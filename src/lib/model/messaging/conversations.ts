import z from "zod";

import { mediaHashPublicSchema } from "$lib/model/media";
import { rightNowStatusSchema } from "$lib/model/right-now";
import {
	knownValueOr,
	knownValueOrNull,
	serverDefault,
} from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";
import { sexualPositionSchema } from "$lib/model/users/profiles";

export const fullConversationSchema = z.object({
	type: z.literal("full_conversation_v1"),
	data: z.object({
		conversationId: z.string(),
		name: z.string(),
		participants: z.array(
			z.object({
				profileId: z.number(),
				primaryMediaHash: mediaHashPublicSchema.nullish(),
				lastOnline: unixTimestampMsSchema.nullish(),
				onlineUntil: unixTimestampMsSchema.nullish(),
				distanceMetres: z.number().nullish(),
				position: knownValueOrNull({
					value: sexualPositionSchema,
					label: "conversation position",
				}),
				isInAList: serverDefault({
					value: z.boolean(),
					fallback: false,
				}),
				hasDatingPotential: serverDefault({
					value: z.boolean(),
					fallback: false,
				}),
			}),
		),
		lastActivityTimestamp: unixTimestampMsSchema,
		unreadCount: z.number(),
		preview: z
			.object({
				type: z.string(),
				text: z.string().nullish(),
				albumId: z.number().nullish(),
				imageHash: mediaHashPublicSchema.nullish(),
				lat: unmodeledSchema,
				lon: unmodeledSchema,
				duration: unmodeledSchema,
				photoContentReply: unmodeledSchema,
			})
			.nullish(),
		muted: serverDefault({ value: z.boolean(), fallback: false }),
		pinned: serverDefault({ value: z.boolean(), fallback: false }),
		favorite: serverDefault({ value: z.boolean(), fallback: false }),
		rightNow: knownValueOr({
			value: rightNowStatusSchema,
			fallback: "NOT_ACTIVE",
			label: "conversation rightNow",
		}),
		onlineUntil: z.number().nullish(),
		hasUnreadThrob: serverDefault({ value: z.boolean(), fallback: false }),
	}),
});

export const conversationEntrySchema = z.discriminatedUnion("type", [
	fullConversationSchema,
]);

export type Conversation = z.infer<typeof conversationEntrySchema>;
