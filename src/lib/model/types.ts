import z from "zod";

export const unixTimestampMsSchema = z.int().nonnegative();

export const unmodeledSchema = z.unknown().optional();
