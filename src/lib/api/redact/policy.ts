export const verbatimKeys = new Set([
	"automated",
	"banSubReason",
	"code",
	"contentType",
	"errorCode",
	"format",
	"height",
	"isBanAutomated",
	"kind",
	"mimeType",
	"reason",
	"status",
	"statusCode",
	"subReason",
	"type",
	"width",
]);

export const proseKeys = new Set(["detail", "error", "message", "title"]);

export const verbatimQueryParams = new Set([
	"limit",
	"offset",
	"page",
	"pageNumber",
	"pageSize",
]);

export const geohashQueryParams = new Set(["exploreGeoHash", "nearbyGeoHash"]);
