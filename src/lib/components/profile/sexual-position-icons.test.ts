import { describe, expect, it } from "vitest";

import { SexualPosition } from "$lib/model/users/profiles";
import {
	sexualPositionIcons,
	sexualPositionOrder,
} from "./sexual-position-icons";

describe("sexual position icons", () => {
	it("orders every known position exactly once", () => {
		const known = Object.values(SexualPosition);

		expect(sexualPositionOrder).toHaveLength(known.length);
		expect(new Set(sexualPositionOrder)).toEqual(new Set(known));
	});

	it("draws each position with a different icon", () => {
		const icons = sexualPositionOrder.map(
			(position) => sexualPositionIcons[position],
		);

		expect(new Set(icons).size).toBe(sexualPositionOrder.length);
	});
});
