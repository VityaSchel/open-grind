import { expect, test } from "@playwright/test";

import { openAttachments } from "./support/drawer";

const RADIUS = "17px";
const SQUARE = "0px";

const BANDS = [
	{ width: 300, columns: 2 },
	{ width: 400, columns: 3 },
	{ width: 650, columns: 4 },
	{ width: 800, columns: 5 },
	{ width: 1100, columns: 6 },
	{ width: 1300, columns: 7 },
];

type Corners = {
	borderTopLeftRadius: string;
	borderTopRightRadius: string;
	borderBottomLeftRadius: string;
	borderBottomRightRadius: string;
};

async function measure(
	page: import("@playwright/test").Page,
	{ width, count }: { width: number; count: number },
) {
	return await page.evaluate(
		({ width, count }) => {
			document.querySelector("#grid-probe")?.remove();
			const host = document.createElement("div");
			host.id = "grid-probe";
			host.className = "@container/photo-grid";
			host.style.width = `${width}px`;
			const grid = document.createElement("div");
			grid.className = "photo-grid";
			for (let i = 0; i < count; i++)
				grid.appendChild(document.createElement("div"));
			host.appendChild(grid);
			document.body.appendChild(host);

			const columns = getComputedStyle(grid)
				.gridTemplateColumns.split(" ")
				.filter(Boolean).length;
			const corners = [...grid.children].map((cell) => {
				const s = getComputedStyle(cell);
				return {
					borderTopLeftRadius: s.borderTopLeftRadius,
					borderTopRightRadius: s.borderTopRightRadius,
					borderBottomLeftRadius: s.borderBottomLeftRadius,
					borderBottomRightRadius: s.borderBottomRightRadius,
				};
			});
			host.remove();
			return { columns, corners };
		},
		{ width, count },
	);
}

function expected({
	count,
	columns,
}: {
	count: number;
	columns: number;
}): Corners[] {
	const topRight = Math.min(columns, count);
	const bottomLeft = columns * Math.floor((count - 1) / columns) + 1;
	return Array.from({ length: count }, (_, i) => {
		const position = i + 1;
		return {
			borderTopLeftRadius: position === 1 ? RADIUS : SQUARE,
			borderTopRightRadius: position === topRight ? RADIUS : SQUARE,
			borderBottomLeftRadius: position === bottomLeft ? RADIUS : SQUARE,
			borderBottomRightRadius: position === count ? RADIUS : SQUARE,
		};
	});
}

test("photo-grid rounds its outer cells at every column count and item count", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await openAttachments(page);
	await expect(page.locator(".photo-grid").first()).toBeVisible({
		timeout: 60_000,
	});

	for (const band of BANDS) {
		for (const count of [1, 2, 3, 5, 8, 15]) {
			const { columns, corners } = await measure(page, {
				width: band.width,
				count,
			});

			expect(
				columns,
				`${band.width}px should lay out ${band.columns} columns`,
			).toBe(band.columns);
			expect(corners, `${columns} columns, ${count} items`).toEqual(
				expected({ count, columns }),
			);
		}
	}
});
