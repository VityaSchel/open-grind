import z from "zod";

export const tapIdSchema = z.number().int().min(0).max(3);
