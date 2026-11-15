import type { Message } from "./source-messages";

function paramsType({ params }: Message): string {
	if (params.length === 0) return "undefined";
	const fields = params.map(
		(name) => `${name}: ${name === "count" ? "number" : "string"}`,
	);
	return `{ ${fields.join("; ")} }`;
}

function namesType({ params, tags, wrapped }: Message): string {
	const kindOf = (name: string) => {
		if (tags.includes(name)) return "tag";
		if (name === "count") return "count";
		return wrapped.includes(name) ? "placeholderInTag" : "placeholder";
	};
	const fields = [...tags, ...params]
		.sort()
		.map((name) => `${name}: "${kindOf(name)}"`);
	return `{ ${fields.join("; ")} }`;
}

function table({ name, members }: { name: string; members: string[] }): string {
	if (members.length === 0) return `export interface ${name} {}\n`;
	const lines = members.map((member) => `\t${member};\n`).join("");
	return `export interface ${name} {\n${lines}}\n`;
}

const isRich = ({ params, tags }: Message) =>
	tags.length > 0 || params.some((name) => name !== "count");

export function renderTypes(messages: Message[]): string {
	const plain = messages.filter(({ tags }) => tags.length === 0);
	const member = (type: (message: Message) => string) => (message: Message) =>
		`${JSON.stringify(message.key)}: ${type(message)}`;
	return [
		table({ name: "Messages", members: plain.map(member(paramsType)) }),
		table({
			name: "RichMessages",
			members: messages.filter(isRich).map(member(namesType)),
		}),
	].join("\n");
}
