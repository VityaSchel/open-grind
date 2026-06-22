import z from "zod";

export const unixTimestampMsSchema = z.int().nonnegative();
