import { describe, expect, it } from "vitest";

import { sourceFile } from "./locale-files";
import { checkTranslation } from "./source-messages";

describe("checkTranslation of rich names", () => {
	const source = [
		sourceFile({
			invite: "Invite {{name}} to <groupLink>the group</groupLink>",
			menu: "Turn this off in the {{menuIcon}} menu.",
			photos_one: "<b>{{count}} photo</b>",
			photos_other: "<b>{{count}} photos</b>",
		}),
	];
	const check = (json: unknown) =>
		checkTranslation({ locale: "ru", files: [sourceFile(json)], source })
			.errors;

	it("accepts names kept in place and wrapped placeholders kept wrapped", () => {
		expect(
			check({
				invite: "Пригласите {{name}} в <groupLink>группу</groupLink>",
				menu: "Отключите это в меню {{menuIcon}}.",
				photos_few: "<b>{{count}} фото</b>",
				photos_many: "<b>{{count}}</b> фотографий",
			}),
		).toEqual([]);
	});

	it.each([
		[
			{ invite: "Пригласите <groupLink>{{name}} в группу</groupLink>" },
			[
				"ru/ns.invite: move {{name}} out of its tag, as in the English message",
			],
		],
		[
			{ invite: "Пригласите {{name}} в <groupLink></groupLink>" },
			[
				"ru/ns.invite: <groupLink> wraps no text; use a {{placeholder}} for what the app supplies",
			],
		],
		[
			{ invite: "Пригласите {{name}} в <grouplink>группу</grouplink>" },
			[
				"ru/ns.invite: <grouplink> is not in the English message",
				"ru/ns.invite: lacks <groupLink> from the English message",
			],
		],
		[
			{ menu: "Отключите это в <b>меню {{menuIcon}}</b>." },
			[
				"ru/ns.menu: <b> is not in the English message",
				"ru/ns.menu: move {{menuIcon}} out of its tag, as in the English message",
			],
		],
		[
			{ menu: "Отключите это в меню." },
			["ru/ns.menu: lacks {{menuIcon}} from the English message"],
		],
		[
			{ menu: "Отключите это в меню {{menuicon}}." },
			[
				"ru/ns.menu: {{menuicon}} is not in the English message",
				"ru/ns.menu: lacks {{menuIcon}} from the English message",
			],
		],
	])("rejects %j", (json, errors) => {
		expect(check(json)).toEqual(errors);
	});
});
