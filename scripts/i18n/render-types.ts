import type { Message } from "./source-messages";

function paramsType({ params }: Message): string {
	if (params.length === 0) return "undefined";
	const fields = params.map(
		(name) => `${name}: ${name === "count" ? "number" : "string"}`,
	);
	return `{ ${fields.join("; ")} }`;
}

function table({ name, members }: { name: string; members: string[] }): string {
	if (members.length === 0) return `export interface ${name} {}\n`;
	const lines = members.map((member) => `\t${member};\n`).join("");
	return `export interface ${name} {\n${lines}}\n`;
}

export function renderTypes(messages: Message[]): string {
	const plain = messages.filter(({ tags }) => tags.length === 0);
	const rich = messages.filter(({ tags }) => tags.length > 0);
	const withParams = (message: Message) =>
		`${JSON.stringify(message.key)}: ${paramsType(message)}`;
	const withTags = ({ key, tags }: Message) =>
		`${JSON.stringify(key)}: ${tags.map((tag) => JSON.stringify(tag)).join(" | ")}`;
	return [
		table({ name: "Messages", members: plain.map(withParams) }),
		table({ name: "RichMessages", members: rich.map(withParams) }),
		table({ name: "RichTags", members: rich.map(withTags) }),
	].join("\n");
}
