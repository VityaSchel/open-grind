import z from "zod";

const modules = import.meta.glob<Record<string, unknown>>(
	["./**/*.ts", "!./**/*.test.ts", "!./schema-names.ts"],
	{ eager: true },
);

for (const module of Object.values(modules)) {
	for (const [binding, value] of Object.entries(module)) {
		if (!(value instanceof z.ZodType)) continue;
		if (z.globalRegistry.get(value) !== undefined) continue;
		z.globalRegistry.add(value, { id: binding.replace(/Schema$/u, "") });
	}
}

export function schemaName(schema: z.ZodType): string | undefined {
	return schema.meta()?.id;
}
