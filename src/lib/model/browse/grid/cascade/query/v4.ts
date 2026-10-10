import z from "zod";

import { filterTribesSchema } from "$lib/model/browse/grid/filters";
import { cascadeQuerySchema } from ".";

export const cascadeV4QuerySchema = z.object({
	...cascadeQuerySchema.shape,
	tribesImInto: filterTribesSchema.optional(),
});
