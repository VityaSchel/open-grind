import z from "zod";

export const rightNowStatusSchema = z.enum([
	"NOT_ACTIVE",
	"HOSTING",
	"NOT_HOSTING",
]);

export const rightNowShareLocationSchema = z.enum([
	"DISTANCE_AND_MAP",
	"DISTANCE_ONLY",
	"NONE",
]);
