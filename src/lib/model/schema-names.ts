import z from "zod";

const modules = import.meta.glob<Record<string, unknown>>(
	["./**/*.ts", "!./**/*.test.ts", "!./schema-names.ts"],
	{ eager: true },
);

const schemaSuffix = "Schema";

for (const module of Object.values(modules)) {
	for (const [binding, value] of Object.entries(module)) {
		if (!(value instanceof z.ZodType)) continue;
		if (z.globalRegistry.get(value) !== undefined) continue;
		z.globalRegistry.add(value, { id: stripSchemaSuffix(binding) });
	}
}

function stripSchemaSuffix(binding: string): string {
	return binding.endsWith(schemaSuffix)
		? binding.slice(0, -schemaSuffix.length)
		: binding;
}

export function schemaName(schema: z.ZodType): string | undefined {
	return schema.meta()?.id;
}
