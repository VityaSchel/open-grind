import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Locator } from "@playwright/test";

const burnerCredentialsFile = join(homedir(), "grindr-burner-password.txt");

export class CredentialsError extends Error {
	override name = "CredentialsError";
}

export function readBurnerCredentials(file = burnerCredentialsFile) {
	let line: string;
	try {
		line = readFileSync(file, "utf8").trim();
	} catch {
		throw new CredentialsError("The burner credentials file is unreadable");
	}
	const separator = line.indexOf(":");
	if (separator <= 0 || separator === line.length - 1) {
		throw new CredentialsError(
			"The burner credentials file is not email:password",
		);
	}
	return {
		email: line.slice(0, separator),
		password: line.slice(separator + 1),
	};
}

async function typeSecret({ field, value }: { field: Locator; value: string }) {
	await field.evaluate((element, secret) => {
		if (!(element instanceof HTMLInputElement)) {
			throw new TypeError("Not an input");
		}
		element.focus();
		element.value = secret;
		element.dispatchEvent(new Event("input", { bubbles: true }));
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}, value);
}

export async function fillBurnerSignIn({
	emailField,
	passwordField,
}: {
	emailField: Locator;
	passwordField: Locator;
}) {
	const { email, password } = readBurnerCredentials();
	try {
		await typeSecret({ field: emailField, value: email });
		await typeSecret({ field: passwordField, value: password });
	} catch {
		throw new CredentialsError("Couldn't fill the sign-in form");
	}
}
