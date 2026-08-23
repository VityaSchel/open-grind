import z from "zod";

export const favoriteNoteSchema = z.object({
	notes: z.string(),
	phoneNumber: z.string(),
});

export type FavoriteNote = z.infer<typeof favoriteNoteSchema>;

export const favoriteNoteWithCounterpartySchema = favoriteNoteSchema.extend({
	counterpartyId: z.int(),
});

export type FavoriteNoteWithCounterparty = z.infer<
	typeof favoriteNoteWithCounterpartySchema
>;

export const favoriteNotesResponseSchema = z.array(
	favoriteNoteWithCounterpartySchema,
);

export type FavoriteNotesResponse = z.infer<typeof favoriteNotesResponseSchema>;

export const favoriteNoteLimits = { notes: 250, phoneNumber: 20 } as const;
