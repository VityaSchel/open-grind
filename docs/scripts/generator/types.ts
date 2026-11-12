export type HttpMethod =
	| "get"
	| "post"
	| "put"
	| "patch"
	| "delete"
	| "head"
	| "options";

export const HTTP_METHODS: HttpMethod[] = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
];

export interface Schema {
	type?: "string" | "integer" | "number" | "boolean" | "object" | "array";
	format?: string;
	description?: string;
	enum?: Array<string | number>;
	properties?: Record<string, Schema>;
	required?: string[];
	items?: Schema;
	allOf?: Schema[];
	oneOf?: Schema[];
	anyOf?: Schema[];
	nullable?: boolean;
	$ref?: string;
	additionalProperties?: boolean | Schema;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	maxItems?: number;
	minimum?: number;
	maximum?: number;
	pattern?: string;
	deprecated?: boolean;
	"x-render-on-tag"?: string;
	"x-display-name"?: string;
	"x-enum-labels"?: Record<string, string>;
	"x-wip"?: boolean;
	"x-property-groups"?: PropertyGroup[];
	"x-key-description"?: string;
	"x-exclude-from-markdown"?: string;
	"x-original-type"?: string;
	"x-discriminator"?: SiblingDiscriminator;
	__allOfRefs?: string[];
}

export interface SiblingDiscriminator {
	propertyName: string;
	mapping: Record<string, string>;
}

export interface PropertyGroup {
	heading: string;
	allOf?: Array<{ $ref: string }>;
	properties?: Record<string, Schema>;
	required?: string[];
}

export interface Parameter {
	name: string;
	in: "query" | "path" | "header" | "cookie";
	required?: boolean;
	schema?: Schema;
	description?: string;
}

export type ParameterOrRef = Parameter | { $ref: string };

export interface ParameterGroup {
	"x-render-on-tag": string;
	"x-inherits"?: string;
	parameters: ParameterOrRef[];
}

export interface MediaType {
	schema?: Schema;
}

export interface Response {
	description?: string;
	content?: Record<string, MediaType>;
}

export interface RequestBody {
	required?: boolean;
	content?: Record<string, MediaType>;
}

export interface Operation {
	operationId: string;
	summary?: string;
	description?: string;
	tags?: string[];
	parameters?: ParameterOrRef[];
	requestBody?: RequestBody;
	responses?: Record<string, Response>;
	security?: object[];
	servers?: { url: string }[];
	deprecated?: boolean;
	"x-wip"?: boolean;
	"x-idempotent"?: boolean;
	"x-paid"?: boolean;
	"x-legacy"?: boolean;
	"x-notes"?: string[];
	"x-see-also"?: string[];
	"x-errors"?: Record<string, string>;
	"x-query-groups"?: string[];
	"x-wip-note"?: string;
	"x-body-label"?: string;
}

export type PathItem = { parameters?: ParameterOrRef[] } & {
	[M in HttpMethod]?: Operation;
};

export interface Tag {
	name: string;
	description?: string;
	"x-wip"?: boolean;
	"x-wip-note"?: string;
}

export interface SidebarGroup {
	group: string;
	items: string[];
}

export type SidebarEntry = string | SidebarGroup;

export interface Components {
	schemas: Record<string, Schema>;
	parameters?: Record<string, Parameter>;
	securitySchemes?: Record<string, object>;
}

export interface OpenApiDoc {
	openapi: string;
	info: { title: string; version: string };
	servers: { url: string }[];
	tags: Tag[];
	paths: Record<string, PathItem>;
	components: Components;
	"x-sidebar-order"?: SidebarEntry[];
	"x-parameter-groups"?: Record<string, ParameterGroup>;
}
