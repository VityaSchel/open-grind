import { expect, type Page } from "@playwright/test";

type AXNode = {
	nodeId: string;
	parentId?: string;
	ignored?: boolean;
	role?: { value?: string };
	name?: { value?: string };
	properties?: { name: string; value: { value?: unknown } }[];
	backendDOMNodeId?: number;
};

export type ChromiumRadio = { name: string; checked: string; group: string };

const NAMED_ROLES = new Set([
	"button",
	"checkbox",
	"combobox",
	"link",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"radio",
	"slider",
	"switch",
	"tab",
	"textbox",
]);

export async function expectEveryControlNamed(page: Page, where: string) {
	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Accessibility.enable");
		const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
			nodes: AXNode[];
		};
		const unnamed: string[] = [];
		for (const node of nodes) {
			const role = node.role?.value ?? "";
			if (node.ignored || !NAMED_ROLES.has(role)) continue;
			if ((node.name?.value ?? "").trim() !== "") continue;
			const { outerHTML } = await cdp
				.send("DOM.getOuterHTML", {
					backendNodeId: node.backendDOMNodeId,
				})
				.catch(() => ({ outerHTML: "<unavailable>" }));
			unnamed.push(
				`${role} ${outerHTML.replace(/class="[^"]*"/g, "class=…").slice(0, 300)}`,
			);
		}
		expect(unnamed, `unnamed controls on ${where}`).toEqual([]);
	} finally {
		await cdp.detach();
	}
}

export async function chromiumRadios(page: Page): Promise<ChromiumRadio[]> {
	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Accessibility.enable");
		const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
			nodes: AXNode[];
		};
		const byId = new Map(nodes.map((node) => [node.nodeId, node]));
		const unignoredParent = ({ parentId }: AXNode) => {
			let parent =
				parentId === undefined ? undefined : byId.get(parentId);
			while (parent?.ignored && parent.parentId !== undefined) {
				parent = byId.get(parent.parentId);
			}
			return parent;
		};
		return nodes
			.filter((node) => !node.ignored && node.role?.value === "radio")
			.map((node) => ({
				name: node.name?.value ?? "",
				checked: String(
					node.properties?.find(({ name }) => name === "checked")
						?.value.value,
				),
				group: unignoredParent(node)?.role?.value ?? "",
			}));
	} finally {
		await cdp.detach();
	}
}
