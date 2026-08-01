import { describe, expect, it } from "vitest";
import z from "zod";

import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { schemaName } from "$lib/model/schema-names";

describe("schemaName", () => {
	it("names an exported schema after its binding", () => {
		expect(schemaName(cascadeV4ResponseSchema)).toBe("cascadeV4Response");
		expect(schemaName(apiResponseMessageSchema)).toBe("apiResponseMessage");
	});

	it("leaves a schema assembled at the call site anonymous", () => {
		expect(schemaName(z.array(cascadeV4ResponseSchema))).toBeUndefined();
	});

	it("does not let a derived schema borrow its parent's name", () => {
		expect(schemaName(cascadeV4ResponseSchema.nullable())).toBeUndefined();
	});
});
