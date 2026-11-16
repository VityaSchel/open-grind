use std::collections::BTreeSet;

use super::Outcome;
use crate::pin_support::{
	is_identifier, kotlin_package, manifest_element, spaced_match, squashed,
	xml_attribute, MANIFEST,
};

const RELAY_BRIDGE: &str = include_str!("android.rs");

const RELAY_GRINDR: &str = include_str!(
	"../../gen/android/app/src/main/java/org/opengrind/push/RelayGrindr.kt"
);

const RELAY_REGISTRATION: &str = include_str!(
	"../../gen/android/app/src/main/java/org/opengrind/push/RelayRegistration.kt"
);

const PUSH_EVENT: &str = "org.unifiedpush.android.connector.PUSH_EVENT";

type Parameter<'a> = (&'a str, &'a str);

fn package() -> &'static str {
	kotlin_package(RELAY_GRINDR, "RelayGrindr.kt")
}

fn symbol_prefix() -> String {
	format!("Java_{}_RelayGrindr_", package().replace('.', "_"))
}

fn kotlin_externals() -> BTreeSet<&'static str> {
	RELAY_GRINDR
		.split("external fun ")
		.skip(1)
		.filter_map(|declaration| declaration.split('(').next())
		.map(str::trim)
		.collect()
}

fn rust_exports() -> BTreeSet<String> {
	let marker =
		format!("#[no_mangle]pubextern\"system\"fn{}", symbol_prefix());
	squashed(RELAY_BRIDGE)
		.split(&marker)
		.skip(1)
		.map(|rest| rest.chars().take_while(|c| is_identifier(*c)).collect())
		.collect()
}

fn jni_type(kotlin: &str) -> &'static str {
	match kotlin {
		"String" => "JString<'local>",
		"Int" => "jint",
		other => panic!("the JNI pin has no JNI type for the Kotlin {other}"),
	}
}

fn snake_case(name: &str) -> String {
	let mut snake = String::new();
	for character in name.chars() {
		if character.is_uppercase() {
			snake.push('_');
		}
		snake.push(character.to_ascii_lowercase());
	}
	snake
}

fn parameters(list: &str) -> Vec<Parameter<'_>> {
	list.split(',')
		.map(str::trim)
		.filter(|parameter| !parameter.is_empty())
		.map(|parameter| {
			let (name, kind) = parameter.split_once(':').unwrap_or_else(|| {
				panic!("the parameter {parameter} declares no type")
			});
			(name.trim(), kind.trim())
		})
		.collect()
}

fn signature<'a>(
	source: &'a str,
	header: &str,
	returns: &str,
	end: char,
) -> (Vec<Parameter<'a>>, &'a str) {
	let found = spaced_match(source, header)
		.unwrap_or_else(|| panic!("no {header} to compare signatures with"));
	let rest = &source[found.end..];
	let open = rest
		.find('(')
		.unwrap_or_else(|| panic!("{header} has no parameter list"));
	let (list, after) = rest[open + 1..]
		.split_once(')')
		.unwrap_or_else(|| panic!("{header} has no closing parenthesis"));
	let answer = after
		.trim_start()
		.strip_prefix(returns)
		.unwrap_or_else(|| panic!("{header} declares no return type"));
	let answer = answer.split(end).next().unwrap_or_default().trim();
	(parameters(list), answer)
}

fn jni_signature<'a>(
	source: &'a str,
	header: &str,
) -> (Vec<Parameter<'a>>, &'a str) {
	let (mut parameters, answer) = signature(source, header, "->", '{');
	assert!(
		parameters.len() >= 2
			&& parameters[0].1.starts_with("JNIEnv")
			&& parameters[1].1.starts_with("JClass"),
		"{header} no longer starts with the JNIEnv and JClass every static JNI function takes"
	);
	(parameters.split_off(2), answer)
}

fn kotlin_integer(source: &str, file: &str, name: &str) -> i32 {
	let start = spaced_match(source, &format!("const val {name} ="))
		.unwrap_or_else(|| panic!("{file} no longer declares {name}"))
		.end;
	let literal: String = source[start..]
		.trim_start()
		.chars()
		.take_while(char::is_ascii_digit)
		.collect();
	literal
		.parse()
		.unwrap_or_else(|_| panic!("{file} {name} is not an integer literal"))
}

#[test]
fn a_relay_signature_is_read_as_named_typed_parameters_in_order() {
	let kotlin =
		"external fun nativeRegister(token: String,\n\tprofileId: String,\n): Int\n";
	assert_eq!(
		signature(kotlin, "external fun nativeRegister", ":", '\n'),
		(vec![("token", "String"), ("profileId", "String")], "Int")
	);
	let jni = "fn Java_x_nativeRegister<\n\t'local,\n>(\n\tmut env: JNIEnv<'local>,\n\t_class: JClass<'local>,\n\tprofile_id: JString<'local>,\n) -> jint {";
	assert_eq!(
		jni_signature(jni, "fn Java_x_nativeRegister"),
		(vec![("profile_id", "JString<'local>")], "jint")
	);
	assert_eq!(snake_case("profileId"), "profile_id");
}

#[test]
fn every_relay_call_kotlin_declares_is_exported_by_the_library_it_loads() {
	let kotlin = kotlin_externals();
	assert_eq!(
		kotlin,
		BTreeSet::from(["nativeRegister", "nativeUnregister"]),
		"RelayGrindr.kt declares other native calls than the relay registration needs"
	);
	let exported = rust_exports();
	assert_eq!(
		exported.iter().map(String::as_str).collect::<BTreeSet<_>>(),
		kotlin,
		"push_relay/android.rs exports other {}* symbols than RelayGrindr.kt declares, so a call would die with UnsatisfiedLinkError",
		symbol_prefix()
	);
	assert!(
		squashed(RELAY_GRINDR).contains("System.loadLibrary(\"open_grind_lib\")"),
		"RelayGrindr.kt no longer loads the library that defines its native calls"
	);
}

#[test]
fn every_relay_call_takes_and_returns_what_kotlin_declares() {
	for method in kotlin_externals() {
		let (parameters, answer) = signature(
			RELAY_GRINDR,
			&format!("external fun {method}"),
			":",
			'\n',
		);
		let symbol = format!("{}{method}", symbol_prefix());
		let (jni_parameters, jni_answer) =
			jni_signature(RELAY_BRIDGE, &format!("fn {symbol}"));
		assert_eq!(
			jni_parameters
				.iter()
				.map(|(name, kind)| ((*name).to_owned(), *kind))
				.collect::<Vec<_>>(),
			parameters
				.iter()
				.map(|(name, kind)| (snake_case(name), jni_type(kind)))
				.collect::<Vec<_>>(),
			"push_relay/android.rs {symbol} reads different parameters, or the same ones in another order, than RelayGrindr.kt passes, so it would link and read garbage"
		);
		assert_eq!(
			jni_answer,
			jni_type(answer),
			"push_relay/android.rs {symbol} returns something other than the {answer} RelayGrindr.kt expects"
		);
	}
}

#[test]
fn the_relay_registration_reads_the_result_codes_rust_returns() {
	for (constant, outcome) in [
		("ACCEPTED", Outcome::Done),
		("RETRYABLE", Outcome::Retry),
		("ACCOUNT_CHANGED", Outcome::Refused),
	] {
		assert_eq!(
			kotlin_integer(RELAY_REGISTRATION, "RelayRegistration.kt", constant),
			outcome.code(),
			"RelayRegistration.kt {constant} is not the code push_relay returns for {outcome:?}"
		);
	}
}

#[test]
fn the_relay_services_are_declared_where_android_and_the_connector_find_them() {
	let package = package();
	let jobs =
		manifest_element("service", &format!("{package}.RelayJobService"));
	assert_eq!(
		xml_attribute(jobs, "android:permission"),
		Some("android.permission.BIND_JOB_SERVICE"),
		"a JobService Android cannot bind never registers the relay token"
	);
	assert_eq!(
		xml_attribute(jobs, "android:exported"),
		Some("false"),
		"RelayJobService must not be reachable from other apps"
	);

	let pushes =
		manifest_element("service", &format!("{package}.RelayPushService"));
	assert_eq!(
		xml_attribute(pushes, "android:exported"),
		Some("false"),
		"RelayPushService must not be reachable from other apps"
	);
	assert!(
		!pushes.ends_with('/'),
		"RelayPushService declares no intent filter"
	);
	let declared = MANIFEST
		.find(pushes)
		.map(|start| &MANIFEST[start..])
		.expect("the RelayPushService element is part of the manifest");
	let declared = declared
		.split_once("</service>")
		.map_or(declared, |(inside, _)| inside);
	assert!(
		squashed(declared)
			.contains(&format!("<actionandroid:name=\"{PUSH_EVENT}\"/>")),
		"RelayPushService does not filter {PUSH_EVENT}, so the connector never delivers an endpoint or a message"
	);
}
