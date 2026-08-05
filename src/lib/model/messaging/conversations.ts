import z from "zod";

import { mediaHashPublicSchema } from "$lib/model/media";
import { rightNowStatusSchema } from "$lib/model/right-now";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";
import { sexualPositionSchema } from "$lib/model/users/profiles";

export const fullConversationSchema = z.object({
	type: z.literal("full_conversation_v1"),
	data: z.object({
		conversationId: z.string(),
		name: z.string(),
		participants: z
			.array(
				z.object({
					profileId: z.number(),
					primaryMediaHash: mediaHashPublicSchema.nullable(),
					lastOnline: unixTimestampMsSchema.nullable(),
					onlineUntil: unixTimestampMsSchema.nullable(),
					distanceMetres: z.number().nullable(),
					position: sexualPositionSchema.nullable(),
					isInAList: z.boolean(),
					hasDatingPotential: z.boolean(),
				}),
			)
			.length(1),
		lastActivityTimestamp: unixTimestampMsSchema,
		unreadCount: z.number(),
		preview: z
			.object({
				type: z.string(),
				text: z.string().nullable(),
				albumId: z.number().nullable(),
				imageHash: mediaHashPublicSchema.nullable(),
				lat: unmodeledSchema,
				lon: unmodeledSchema,
				duration: unmodeledSchema,
				photoContentReply: unmodeledSchema,
			})
			.nullable(),
		muted: z.boolean(),
		pinned: z.boolean(),
		favorite: z.boolean(),
		rightNow: rightNowStatusSchema,
		onlineUntil: z.number().nullable(),
		hasUnreadThrob: z.boolean(),
	}),
});

export type Conversation = z.infer<typeof fullConversationSchema>;
