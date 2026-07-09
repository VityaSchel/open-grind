import z from "zod";

import { cascadeQuerySchema } from ".";

export const cascadeV4QuerySchema = z.object({
	...cascadeQuerySchema.shape,
});
