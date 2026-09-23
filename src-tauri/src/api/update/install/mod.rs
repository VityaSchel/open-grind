#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub use android::AndroidUpdater;
#[cfg(not(target_os = "android"))]
mod desktop;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use super::baseline::{Baseline, InstallKind};
use super::component::{self, Component};
use super::release::Candidate;

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
const MEDIA_UPLOAD: &str = "mediaUpload";

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Debug, Clone, Copy)]
enum TransferPurpose {
	Update {
		package_name: &'static str,
		kind: InstallKind,
	},
	MediaUpload,
}

pub struct TransferHold<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	purpose: TransferPurpose,
}

impl<'a, R: Runtime> TransferHold<'a, R> {
	pub fn update(app: &'a AppHandle<R>, candidate: &Candidate) -> Self {
		let package_name = component::by_key(&candidate.component)
			.map_or(component::SELF_PACKAGE, Component::install_target);
		Self::begin(
			app,
			TransferPurpose::Update {
				package_name,
				kind: candidate.kind,
			},
		)
	}

	pub fn media_upload(app: &'a AppHandle<R>) -> Self {
		Self::begin(app, TransferPurpose::MediaUpload)
	}

	fn begin(app: &'a AppHandle<R>, purpose: TransferPurpose) -> Self {
		platform::begin_transfer(app, purpose);
		Self { app, purpose }
	}
}

impl<R: Runtime> Drop for TransferHold<'_, R> {
	fn drop(&mut self) {
		platform::end_transfer(self.app, self.purpose);
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "reason",
	content = "detail"
)]
pub enum Unsupported {
	ExternallyManaged { installer: String },
	ForeignSigner,
	ForeignTarget,
	Undetermined,
	NoReleaseArtifacts { target: String },
	Sandboxed { runtime: String },
	LocationNotWritable { path: String },
}

impl Unsupported {
	#[cfg_attr(not(target_os = "android"), allow(dead_code))]
	fn from_gate_marker(
		marker: &str,
		installer: Option<String>,
	) -> Option<Self> {
		match marker {
			"externally-managed" => Some(Self::ExternallyManaged {
				installer: installer.unwrap_or_else(|| "another store".into()),
			}),
			"foreign-signer" => Some(Self::ForeignSigner),
			"foreign-target" => Some(Self::ForeignTarget),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "state",
	content = "detail"
)]
pub enum Capability {
	Supported {
		payload_suffix: String,
		can_install_now: bool,
	},
	Unsupported(Unsupported),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
	#[serde(default)]
	pub package_name: Option<String>,
	pub succeeded: bool,
	#[serde(default)]
	pub canceled: bool,
	pub code: Option<i32>,
	pub message: Option<String>,
}

fn suffix_for(os: &str, arch: &str) -> Option<String> {
	let arch = match arch {
		"aarch64" => "arm64",
		other => other,
	};
	match os {
		"android" => Some("-android.apk".to_owned()),
		"macos" => Some("-macos.zip".to_owned()),
		"windows" => Some(format!("-windows-{arch}.exe")),
		"linux" => Some(format!("-linux-{arch}.AppImage")),
		_ => None,
	}
}

pub fn release_asset_suffix() -> Option<String> {
	let os = std::env::consts::OS;
	if os == "linux" && crate::appimage::path().is_none() {
		return None;
	}
	suffix_for(os, std::env::consts::ARCH)
}

fn target() -> String {
	format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub fn capability_for(
	app: &tauri::AppHandle,
	component: &Component,
) -> Capability {
	let can_install_now = match platform::verdict(app, component) {
		Ok(can_install_now) => can_install_now,
		Err(reason) => return Capability::Unsupported(reason),
	};
	match (component.asset_suffix)() {
		Some(payload_suffix) => Capability::Supported {
			payload_suffix,
			can_install_now,
		},
		None => Capability::Unsupported(Unsupported::NoReleaseArtifacts {
			target: target(),
		}),
	}
}

pub fn probe(app: &tauri::AppHandle, component: &Component) -> Baseline {
	match component.package() {
		None => Baseline::of_version(app.package_info().version.clone()),
		Some(package) => platform::probe_package(app, package),
	}
}

#[cfg(target_os = "android")]
use android as platform;
#[cfg(not(target_os = "android"))]
use desktop as platform;

pub use platform::{
	enforce_home, install, install_pending, open_install_permission_settings,
	sweep_replaced, take_outcome, watch_install,
};

#[cfg(test)]
mod pins {
	use super::{suffix_for, Unsupported};
	use crate::pin_support::{
		addon_gate_verdicts, assert_rejections_classify_as, braced_block,
		is_identifier, kotlin_constant, kotlin_package, source_tokens,
		spaced_match, squashed, ADDON_GATE, MANIFEST,
	};

	const KEYS: &str = include_str!("../../../../../KEYS.md");
	const LINUX_BUILD: &str = include_str!("../../../../../ci/linux/build.sh");
	const GATE: &str = include_str!(
		"../../../../android-logic/src/main/kotlin/org/opengrind/update/InstallGate.kt"
	);
	const PLAY_OVERLAY: &str = include_str!(
		"../../../../gen/android/app/src/play/AndroidManifest.xml"
	);

	fn hex64(line: &str) -> bool {
		line.len() == 64 && line.chars().all(|c| c.is_ascii_hexdigit())
	}

	const PLUGIN: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/UpdatePlugin.kt"
	);

	const ANDROID_BRIDGE: &str = include_str!("android.rs");

	const INSTALL_MODULE: &str = include_str!("mod.rs");

	const COMPONENTS_TS: &str =
		include_str!("../../../../../src/lib/updates/components.ts");

	const INSTALLER: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/ApkInstaller.kt"
	);

	const PROBE: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/InstallProbe.kt"
	);

	const SIGN_IN_PLUGIN: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/googleoauth/GoogleOauthPlugin.kt"
	);

	const TOKEN_HANDOFF: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/TokenHandoffActivity.kt"
	);

	const TRANSFER_TITLE: &str = include_str!(
		"../../../../android-logic/src/main/kotlin/org/opengrind/update/TransferTitle.kt"
	);

	const TRANSFER_SERVICE: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/TransferService.kt"
	);

	const RECAPTCHA_PLUGIN: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/recaptcha/RecaptchaPlugin.kt"
	);

	const RECAPTCHA_BRIDGE: &str = include_str!("../../recaptcha/android.rs");

	const MINT_TOKEN_PERMISSION: &str =
		"org.opengrind.recaptcha.permission.MINT_TOKEN";

	const ADDON_NAMES: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/addon/AddonNames.kt"
	);

	const ANDROID_STRINGS: &str = include_str!(
		"../../../../gen/android/app/src/main/res/values/strings.xml"
	);

	const SIGNING_CERTIFICATES: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/addon/PackageSigningCertificates.kt"
	);

	const ADDON_LAUNCH_CHECK: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/addon/AddonLaunchCheck.kt"
	);

	const REQUEST_TOKEN_PERMISSION: &str =
		"org.opengrind.google_oauth.permission.REQUEST_TOKEN";
	const REQUEST_TOKEN_ACTION: &str =
		"org.opengrind.google_oauth.action.REQUEST_TOKEN";
	const TOKEN_EXTRA: &str = "org.opengrind.google_oauth.extra.TOKEN";

	fn bridge_function(name: &str) -> &'static str {
		let start = ANDROID_BRIDGE
			.find(&format!("fn {name}("))
			.unwrap_or_else(|| panic!("android.rs no longer defines {name}"));
		let length =
			ANDROID_BRIDGE[start..].find("\n}\n").unwrap_or_else(|| {
				panic!("android.rs {name} has no closing brace")
			});
		&ANDROID_BRIDGE[start..start + length]
	}

	fn xml_elements(source: &str) -> impl Iterator<Item = (&str, &str)> {
		source.match_indices('<').filter_map(|(at, _)| {
			let end = source[at..].find('>').map_or(source.len(), |i| at + i);
			let element = &source[at + 1..end];
			let tag = element
				.split(|c: char| c.is_whitespace() || c == '/')
				.next()?;
			tag.starts_with(|c: char| c.is_ascii_alphabetic())
				.then_some((tag, element))
		})
	}

	fn xml_attribute<'a>(element: &'a str, name: &str) -> Option<&'a str> {
		let assignment = format!("{name}=\"");
		element.match_indices(&assignment).find_map(|(at, _)| {
			let value = &element[at + assignment.len()..];
			element[..at]
				.ends_with(char::is_whitespace)
				.then(|| value.split('"').next().unwrap_or_default())
		})
	}

	fn manifest_element(tag: &str, name: &str) -> &'static str {
		let opening = format!("<{tag}");
		let named = format!("android:name=\"{name}\"");
		MANIFEST
			.match_indices(&opening)
			.map(|(at, _)| {
				let end =
					MANIFEST[at..].find('>').map_or(MANIFEST.len(), |i| at + i);
				&MANIFEST[at..end]
			})
			.find(|element| element.contains(&named))
			.unwrap_or_else(|| {
				panic!("the manifest has no <{tag}> named {name}")
			})
	}

	fn gate_verdicts() -> Vec<String> {
		let header = ["sealed interface Verdict", "sealed class Verdict"]
			.into_iter()
			.find(|header| spaced_match(GATE, header).is_some())
			.expect("InstallGate.kt no longer declares a sealed Verdict");
		let body = braced_block(GATE, "InstallGate.kt", header);
		let mut verdicts = Vec::new();
		let mut depth = 0;
		let mut previous = "";
		let mut declaring = false;
		for token in source_tokens(body) {
			match token {
				"{" | "(" => depth += 1,
				"}" | ")" => depth -= 1,
				"object" | "class" if depth == 0 && previous != "companion" => {
					declaring = true;
				}
				name if declaring => {
					verdicts.push(name.to_owned());
					declaring = false;
				}
				_ => {}
			}
			previous = token;
		}
		verdicts
	}

	fn marker_of<'a>(branches: &'a str, verdict: &str) -> Option<&'a str> {
		let arm = format!("InstallGate.Verdict.{verdict}->");
		let start = branches.find(&arm)? + arm.len();
		let rest = &branches[start..];
		let arm_end = rest.find("InstallGate.Verdict.").unwrap_or(rest.len());
		let reason = "put(\"reason\",\"";
		let marker_start = rest[..arm_end].find(reason)? + reason.len();
		let marker = &rest[marker_start..arm_end];
		marker.find('"').map(|end| &marker[..end])
	}

	#[test]
	fn every_gate_refusal_the_kotlin_side_sends_maps_to_its_reason() {
		let verdicts = gate_verdicts();
		assert!(
			verdicts.iter().any(|verdict| verdict == "Supported"),
			"InstallGate.Verdict was not parsed: {verdicts:?}"
		);
		let refusals: Vec<&String> = verdicts
			.iter()
			.filter(|verdict| *verdict != "Supported")
			.collect();
		assert!(
			!refusals.is_empty(),
			"InstallGate.Verdict declares no refusal: {verdicts:?}"
		);
		let plugin = squashed(PLUGIN);
		let installer = squashed(INSTALLER);
		for verdict in ["Supported"]
			.iter()
			.copied()
			.chain(refusals.iter().map(|verdict| verdict.as_str()))
		{
			let arm = format!("InstallGate.Verdict.{verdict}->");
			assert!(
				plugin.contains(&arm),
				"UpdatePlugin.capability has no branch for {verdict}"
			);
			assert!(
				installer.contains(&arm),
				"ApkInstaller.install has no branch for {verdict}"
			);
		}
		for verdict in refusals {
			let marker = marker_of(&plugin, verdict).unwrap_or_else(|| {
				panic!("UpdatePlugin.capability sends no reason for {verdict}")
			});
			assert!(
				installer.contains(&format!(
					"InstallGate.Verdict.{verdict}->throwInstallRefused(\"{marker}\")"
				)),
				"ApkInstaller.install does not refuse {verdict} as {marker}"
			);
			assert!(
				Unsupported::from_gate_marker(marker, None).is_some(),
				"the bridge does not map {verdict}'s marker {marker}"
			);
		}
		for (marker, expected) in [
			(
				"externally-managed",
				Unsupported::ExternallyManaged {
					installer: "another store".into(),
				},
			),
			("foreign-signer", Unsupported::ForeignSigner),
			("foreign-target", Unsupported::ForeignTarget),
		] {
			assert_eq!(
				Unsupported::from_gate_marker(marker, None),
				Some(expected),
				"the bridge maps {marker} to the wrong reason"
			);
		}
		assert_eq!(
			Unsupported::from_gate_marker(
				"externally-managed",
				Some("org.fdroid.fdroid".into())
			),
			Some(Unsupported::ExternallyManaged {
				installer: "org.fdroid.fdroid".into()
			})
		);
		assert_eq!(Unsupported::from_gate_marker("downgrade", None), None);
	}

	#[test]
	fn the_android_bridge_reads_gate_refusals_through_the_shared_mapping() {
		assert!(
			bridge_function("verdict").contains(
				"Unsupported::from_gate_marker(reason, response.installer)"
			),
			"android.rs verdict no longer maps capability reasons through from_gate_marker"
		);
		let refusal = bridge_function("map_plugin_error");
		assert!(
			refusal.contains("Unsupported::from_gate_marker(marker, None)")
				&& refusal.contains("return UpdateError::Unsupported(unsupported);"),
			"android.rs map_plugin_error no longer maps install refusals through from_gate_marker"
		);
		assert!(
			bridge_function("install").contains(".map_err(map_plugin_error)"),
			"android.rs install no longer maps plugin errors"
		);
	}

	#[test]
	fn the_install_probe_judges_the_target_by_one_signature_check() {
		assert!(
			squashed(PROBE).contains(&squashed(
				"targetSigner = InstallGate.TargetSigner.of(context.packageManager.checkSignatures(context.packageName, target)"
			)),
			"InstallProbe.verdictFor no longer maps a single checkSignatures result through TargetSigner.of"
		);
	}

	#[test]
	fn the_install_permission_is_probed_only_where_the_manifest_requests_it() {
		assert!(
			spaced_match(
				PROBE,
				"fun canInstallNow(context: Context): Boolean = infoOf(context, context.packageName, PackageManager.GET_PERMISSIONS)?.requestedPermissions?.contains(Manifest.permission.REQUEST_INSTALL_PACKAGES) == true && context.packageManager.canRequestPackageInstalls()"
			)
			.is_some(),
			"InstallProbe.canInstallNow calls canRequestPackageInstalls without checking the manifest requests REQUEST_INSTALL_PACKAGES, and Android throws a SecurityException where it does not"
		);
	}

	#[test]
	fn the_sign_in_handoff_matches_the_companion_contract() {
		use super::super::component;

		let companion = component::GOOGLE_OAUTH.install_target();
		assert!(
			MANIFEST.contains(&format!(
				"<uses-permission android:name=\"{REQUEST_TOKEN_PERMISSION}\" />"
			)),
			"the manifest no longer asks for {REQUEST_TOKEN_PERMISSION}, so the companion refuses the token request"
		);
		assert!(
			REQUEST_TOKEN_PERMISSION.starts_with(&format!("{companion}.")),
			"the component table package {companion} no longer owns {REQUEST_TOKEN_PERMISSION}"
		);

		assert!(
			!manifest_element("activity", ".TokenHandoffActivity")
				.contains("android:permission="),
			"TokenHandoffActivity requires a permission again, which a Play-signed install can never grant the companion"
		);
		assert!(
			squashed(TOKEN_HANDOFF).contains(&squashed(
				"AddonGate.acceptsCaller( callingPackage = callingPackage, addonPackage = COMPANION_PACKAGE, certificates = packageManager.signingCertificates(), )"
			)),
			"TokenHandoffActivity no longer checks its caller through AddonGate.acceptsCaller, yet any app may start it"
		);

		assert!(
			MANIFEST
				.contains(&format!("<package android:name=\"{companion}\" />")),
			"the manifest <queries> no longer names the companion {companion}"
		);
		for (file, source) in [
			("GoogleOauthPlugin.kt", SIGN_IN_PLUGIN),
			("TokenHandoffActivity.kt", TOKEN_HANDOFF),
		] {
			assert_eq!(
				kotlin_constant(source, file, "COMPANION_PACKAGE"),
				companion,
				"{file} COMPANION_PACKAGE drifted from the component table"
			);
			assert_eq!(
				kotlin_constant(source, file, "EXTRA_TOKEN"),
				TOKEN_EXTRA,
				"{file} EXTRA_TOKEN drifted from the companion's published extra"
			);
		}
		assert_eq!(
			kotlin_constant(
				SIGN_IN_PLUGIN,
				"GoogleOauthPlugin.kt",
				"REQUEST_TOKEN_ACTION"
			),
			REQUEST_TOKEN_ACTION,
			"GoogleOauthPlugin.kt REQUEST_TOKEN_ACTION drifted from the companion's published action"
		);
	}

	#[test]
	fn every_literal_plugin_command_the_bridge_invokes_exists_in_kotlin() {
		let invoked: Vec<&str> = ANDROID_BRIDGE
			.split("run_mobile_plugin")
			.skip(1)
			.filter_map(|call| {
				let arguments = call[call.find('(')? + 1..].trim_start();
				arguments.strip_prefix('"')?.split('"').next()
			})
			.collect();
		assert!(
			invoked.contains(&"installPending"),
			"the bridge no longer asks the plugin whether an install is pending"
		);
		for command in invoked {
			assert!(
				spaced_match(
					PLUGIN,
					&format!("@Command fun {command}(invoke: Invoke)")
				)
				.is_some(),
				"UpdatePlugin has no @Command named {command}"
			);
		}
	}

	fn declaration_at(source: &str, file: &str, header: &str) -> usize {
		spaced_match(source, header)
			.unwrap_or_else(|| panic!("{file} no longer declares {header}"))
			.start
	}

	fn declaration_block<'a>(
		source: &'a str,
		file: &str,
		header: &str,
	) -> &'a str {
		let at = declaration_at(source, file, header);
		braced_block(&source[at..], file, header)
	}

	fn camel_case(snake: &str) -> String {
		let mut parts = snake.split('_');
		let mut camel = parts.next().unwrap_or_default().to_owned();
		for part in parts {
			let mut characters = part.chars();
			if let Some(first) = characters.next() {
				camel.extend(first.to_uppercase());
				camel.push_str(characters.as_str());
			}
		}
		camel
	}

	struct PluginPair {
		bridge_file: &'static str,
		bridge: &'static str,
		plugin_file: &'static str,
		plugin: &'static str,
	}

	const UPDATE_PAIR: PluginPair = PluginPair {
		bridge_file: "install/android.rs",
		bridge: ANDROID_BRIDGE,
		plugin_file: "UpdatePlugin.kt",
		plugin: PLUGIN,
	};

	const RECAPTCHA_PAIR: PluginPair = PluginPair {
		bridge_file: "recaptcha/android.rs",
		bridge: RECAPTCHA_BRIDGE,
		plugin_file: "RecaptchaPlugin.kt",
		plugin: RECAPTCHA_PLUGIN,
	};

	impl PluginPair {
		fn requests(&self) -> Vec<(&'static str, &'static str)> {
			self.bridge
				.split("run_mobile_plugin")
				.skip(1)
				.filter_map(|call| {
					let arguments = call[call.find('(')? + 1..].trim_start();
					let (command, rest) =
						arguments.strip_prefix('"')?.split_once('"')?;
					let request =
						rest.trim_start().strip_prefix(',')?.trim_start();
					let length = request.find(|c: char| !is_identifier(c))?;
					let name = &request[..length];
					let constructed = name.starts_with(char::is_uppercase)
						&& request[length..].trim_start().starts_with('{');
					constructed.then_some((command, name))
				})
				.collect()
		}

		fn rust_wire_fields(&self, name: &str) -> Vec<String> {
			let header = format!("struct {name}");
			let at = declaration_at(self.bridge, self.bridge_file, &header);
			let attributes = self.bridge[..at]
				.rsplit_once("\n\n")
				.map_or(&self.bridge[..at], |(_, attributes)| attributes);
			let camel =
				squashed(attributes).contains("rename_all=\"camelCase\"");
			let body =
				declaration_block(self.bridge, self.bridge_file, &header);
			let mut renamed = None;
			let mut fields = Vec::new();
			for line in
				body.lines().map(str::trim).filter(|line| !line.is_empty())
			{
				if line.starts_with("#[") {
					renamed = renamed.or_else(|| {
						squashed(line).split_once("rename=\"").and_then(
							|(_, rest)| {
								rest.split('"').next().map(str::to_owned)
							},
						)
					});
					continue;
				}
				let Some((field, _)) = line.split_once(':') else {
					continue;
				};
				let field = field.trim().trim_start_matches("pub ").trim();
				fields.push(renamed.take().unwrap_or_else(|| {
					if camel {
						camel_case(field)
					} else {
						field.to_owned()
					}
				}));
			}
			fields.sort();
			fields
		}

		fn kotlin_arg_fields(&self, class: &str) -> Vec<String> {
			let body = declaration_block(
				self.plugin,
				self.plugin_file,
				&format!("class {class}"),
			);
			let mut fields: Vec<String> = body
				.lines()
				.map(|line| {
					line.trim().trim_start_matches("lateinit ").trim_start()
				})
				.filter_map(|line| {
					line.strip_prefix("var ")
						.or_else(|| line.strip_prefix("val "))
				})
				.filter_map(|line| line.split(':').next())
				.map(|field| field.trim().to_owned())
				.collect();
			fields.sort();
			fields
		}

		fn parsed_arg_class(&self, command: &str) -> Option<&'static str> {
			let body = braced_block(
				self.plugin,
				self.plugin_file,
				&format!("fun {command}(invoke: Invoke)"),
			);
			let class =
				body[spaced_match(body, "parseArgs(")?.end..].trim_start();
			let length = class.find(|character| !is_identifier(character))?;
			(length > 0).then(|| &class[..length])
		}

		fn assert_requests_carry_the_parsed_fields(&self, expected: &[&str]) {
			let requests = self.requests();
			for expected in expected {
				assert!(
					requests.iter().any(|(command, _)| command == expected),
					"{} no longer sends a request struct to {expected}: {requests:?}",
					self.bridge_file
				);
			}
			for (command, request) in &requests {
				let class =
					self.parsed_arg_class(command).unwrap_or_else(|| {
						panic!(
							"{}.{command} ignores the {request} it is sent",
							self.plugin_file
						)
					});
				let sent = self.rust_wire_fields(request);
				assert!(
					!sent.is_empty(),
					"{request} was parsed as having no fields"
				);
				assert_eq!(
					sent,
					self.kotlin_arg_fields(class),
					"{request} and the {class} that {}.{command} parses disagree on field names",
					self.plugin_file
				);
			}

			let parsing: Vec<&str> = self
				.plugin
				.split("@Command")
				.skip(1)
				.filter_map(|command| {
					let start = command.find("fun ")? + "fun ".len();
					let name = command[start..].split('(').next()?.trim();
					self.parsed_arg_class(name).map(|_| name)
				})
				.collect();
			for command in parsing {
				assert!(
					requests.iter().any(|(sent, _)| *sent == command),
					"{}.{command} parses arguments the bridge never sends",
					self.plugin_file
				);
			}
		}
	}

	#[test]
	fn every_request_the_bridge_sends_carries_the_fields_kotlin_parses() {
		UPDATE_PAIR.assert_requests_carry_the_parsed_fields(&[
			"install",
			"capability",
			"packageState",
			"watchInstall",
		]);
	}

	#[test]
	fn the_recaptcha_request_carries_the_fields_kotlin_parses() {
		RECAPTCHA_PAIR.assert_requests_carry_the_parsed_fields(&["mintToken"]);
	}

	fn components_ts_constant(name: &str) -> String {
		let source = squashed(COMPONENTS_TS);
		let declaration = format!("exportconst{name}=\"");
		let start = source.find(&declaration).unwrap_or_else(|| {
			panic!("components.ts no longer declares {name} as a string")
		}) + declaration.len();
		source[start..]
			.split('"')
			.next()
			.unwrap_or_default()
			.to_owned()
	}

	fn components_ts_table(name: &str) -> Vec<(String, String)> {
		let source = squashed(COMPONENTS_TS);
		let opening = format!("{name}={{");
		let start = source.find(&opening).unwrap_or_else(|| {
			panic!("components.ts no longer declares {name}")
		}) + opening.len();
		let table = &source[start..];
		let table = &table[..table
			.find('}')
			.unwrap_or_else(|| panic!("{name} is not closed"))];
		let mut entries: Vec<(String, String)> = table
			.split(',')
			.filter(|entry| !entry.is_empty())
			.map(|entry| {
				let (key, value) = entry.split_once(':').unwrap_or_else(|| {
					panic!("{name} entry {entry} is not key: value")
				});
				let key = match key
					.strip_prefix('[')
					.and_then(|constant| constant.strip_suffix(']'))
				{
					Some(constant) => components_ts_constant(constant),
					None => key.trim_matches(['"', '\'']).to_owned(),
				};
				(key, value.trim_matches(['"', '\'']).to_owned())
			})
			.collect();
		entries.sort();
		entries
	}

	#[test]
	fn the_frontend_component_table_matches_the_rust_one() {
		use super::super::component;

		let mut expected: Vec<(String, String)> = component::ALL
			.iter()
			.map(|component| {
				(
					component.key.to_owned(),
					component.install_target().to_owned(),
				)
			})
			.collect();
		expected.sort();

		assert_eq!(
			components_ts_table("COMPONENT_PACKAGE"),
			expected,
			"install outcomes are routed by COMPONENT_PACKAGE, so it must name every component's install target"
		);
	}

	#[test]
	fn every_addon_is_named_the_same_in_the_app_and_in_its_download_notification(
	) {
		use super::super::component;

		let names = components_ts_table("ADDON_NAME");
		let mut addons: Vec<&str> = component::ALL
			.iter()
			.filter(|component| !component.is_self())
			.map(|component| component.key)
			.collect();
		addons.sort_unstable();
		assert_eq!(
			names
				.iter()
				.map(|(key, _)| key.as_str())
				.collect::<Vec<_>>(),
			addons,
			"ADDON_NAME must name every add-on the component table knows"
		);

		for (key, name) in names {
			let resource = format!("addon_name_{}", key.replace('-', "_"));
			assert!(
				squashed(ANDROID_STRINGS).contains(&squashed(&format!(
					"<string name=\"{resource}\">{name}</string>"
				))),
				"strings.xml {resource} does not match ADDON_NAME, so the download notification names the add-on differently from the rest of the app"
			);
			let package = component::by_key(&key).unwrap().install_target();
			assert!(
				squashed(ADDON_NAMES).contains(&squashed(&format!(
					"\"{package}\"->R.string.{resource}"
				))),
				"AddonNames.kt does not map {package} to {resource}"
			);
		}
	}

	#[test]
	fn the_app_baseline_is_always_an_orderable_version() {
		assert!(
			squashed(braced_block(INSTALL_MODULE, "install/mod.rs", "pub fn probe("))
				.contains("None=>Baseline::of_version(app.package_info().version.clone())"),
			"an opaque app baseline would make the startup purge delete a staged self-update"
		);
	}

	fn kotlin_allowlist() -> Vec<&'static str> {
		let start = spaced_match(
			PLUGIN,
			"private fun isInstallableTarget(packageName: String): Boolean =",
		)
		.expect("UpdatePlugin no longer declares isInstallableTarget")
		.end;
		let expression =
			squashed(PLUGIN[start..].split("@Command").next().unwrap_or(""));
		assert!(
			expression.starts_with("packageName==activity.packageName||"),
			"the allowlist must still admit this app itself: {expression}"
		);
		expression
			.split("||")
			.skip(1)
			.map(|term| {
				let constant =
					term.strip_prefix("packageName==").unwrap_or_else(|| {
						panic!("isInstallableTarget term {term} is not a package comparison")
					});
				kotlin_constant(PLUGIN, "UpdatePlugin.kt", constant)
			})
			.collect()
	}

	#[test]
	fn the_kotlin_install_allowlist_matches_the_component_table() {
		use super::super::component;

		let mut allowlisted = kotlin_allowlist();
		allowlisted.sort_unstable();

		let mut expected: Vec<&str> = component::ALL
			.iter()
			.map(|c| c.install_target())
			.filter(|target| *target != component::SELF_PACKAGE)
			.collect();
		expected.sort_unstable();

		assert_eq!(
			allowlisted, expected,
			"every non-self component must appear in the Kotlin allowlist"
		);
		for target in &expected {
			assert!(
				MANIFEST
					.contains(&format!("<package android:name=\"{target}\" />")),
				"{target} needs a <queries> entry or the package probe reports it absent"
			);
		}
	}

	#[test]
	fn add_ons_are_trusted_by_their_pinned_release_certificate_whoever_signed_this_build(
	) {
		assert!(
			squashed(ADDON_LAUNCH_CHECK).contains(&squashed(
				"certificates = packageManager.signingCertificates(),"
			)) && !ADDON_LAUNCH_CHECK.contains("checkSignatures"),
			"AddonLaunchCheck.kt no longer trusts an add-on by its pinned certificate, so a Play-signed build refuses every official add-on"
		);
		assert!(
			spaced_match(
				SIGNING_CERTIFICATES,
				"hasSigningCertificate(packageName, sha256, PackageManager.CERT_INPUT_SHA256)"
			)
			.is_some(),
			"PackageSigningCertificates.kt no longer answers AddonGate from PackageManager.hasSigningCertificate"
		);
		assert!(
			spaced_match(
				ADDON_GATE,
				"private val releaseCertSha256: ByteArray = InstallGate.RELEASE_CERT_SHA256"
			)
			.is_some(),
			"AddonGate.kt no longer pins the add-on signer to InstallGate.RELEASE_CERT_SHA256"
		);
		for (file, plugin, package) in [
			("GoogleOauthPlugin.kt", SIGN_IN_PLUGIN, "COMPANION_PACKAGE"),
			("RecaptchaPlugin.kt", RECAPTCHA_PLUGIN, "ADDON_PACKAGE"),
		] {
			assert!(
				squashed(plugin).contains(&squashed(&format!(
					"when (AddonLaunchCheck.decide(activity, intent, {package}))"
				))),
				"{file} no longer checks {package} through AddonLaunchCheck before sending it the request"
			);
		}
	}

	#[test]
	fn every_addon_plugin_answers_every_gate_verdict() {
		let verdicts = addon_gate_verdicts();
		assert!(
			verdicts.contains(&"Launch") && verdicts.len() > 1,
			"AddonGate.Verdict was not parsed: {verdicts:?}"
		);
		for (file, plugin) in [
			("GoogleOauthPlugin.kt", SIGN_IN_PLUGIN),
			("RecaptchaPlugin.kt", RECAPTCHA_PLUGIN),
		] {
			let plugin = squashed(plugin);
			assert!(
				plugin.contains("importorg.opengrind.addon.AddonGate"),
				"{file} no longer uses the shared add-on gate"
			);
			for verdict in &verdicts {
				assert!(
					plugin.contains(&format!("AddonGate.Verdict.{verdict}->")),
					"{file} has no branch for AddonGate.Verdict.{verdict}"
				);
			}
		}
	}

	#[test]
	fn every_recaptcha_plugin_refusal_classifies_to_its_reason() {
		use crate::api::recaptcha::RecaptchaError;

		let file = "RecaptchaPlugin.kt";
		let plugin = squashed(RECAPTCHA_PLUGIN);
		let refusals = addon_gate_verdicts()
			.into_iter()
			.filter(|verdict| *verdict != "Launch");
		for verdict in refusals {
			let (constant, expected) = match verdict {
				"Unavailable" => {
					("ERROR_UNAVAILABLE", RecaptchaError::AddonUnavailable)
				}
				"Disabled" => ("ERROR_DISABLED", RecaptchaError::AddonDisabled),
				"Untrusted" => {
					("ERROR_UNTRUSTED", RecaptchaError::AddonUntrusted)
				}
				unknown => panic!(
					"AddonGate.Verdict.{unknown} has no reCAPTCHA reason"
				),
			};
			assert!(
				plugin.contains(&format!(
					"AddonGate.Verdict.{verdict}->invoke.reject({constant})"
				)),
				"{file} no longer rejects {verdict} with {constant}"
			);
			let marker = kotlin_constant(RECAPTCHA_PLUGIN, file, constant);
			assert_eq!(
				RecaptchaError::from_rejection(Some(marker), None),
				expected,
				"{file} {constant} = {marker} is not classified as {expected:?}"
			);
		}
		for (constant, expected) in [
			("ERROR_CANCELLED", RecaptchaError::Cancelled),
			("ERROR_NO_TOKEN", RecaptchaError::NoToken),
		] {
			assert!(
				plugin.contains(&format!("invoke.reject({constant})")),
				"{file} never rejects with {constant}"
			);
			let marker = kotlin_constant(RECAPTCHA_PLUGIN, file, constant);
			assert_eq!(
				RecaptchaError::from_rejection(Some(marker), None),
				expected,
				"{file} {constant} = {marker} is not classified as {expected:?}"
			);
		}
		assert!(
			plugin.contains(
				"invoke.reject(refusal,data.getStringExtra(EXTRA_ERROR_DETAIL))"
			),
			"{file} no longer passes the add-on's error and its detail through"
		);
		assert_rejections_classify_as(
			"recaptcha/android.rs",
			RECAPTCHA_BRIDGE,
			"RecaptchaError",
		);
	}

	#[test]
	fn the_recaptcha_mint_matches_the_addon_contract() {
		use super::super::component;

		let file = "RecaptchaPlugin.kt";
		let addon = component::RECAPTCHA.install_target();
		assert_eq!(
			kotlin_constant(RECAPTCHA_PLUGIN, file, "ADDON_PACKAGE"),
			addon,
			"{file} ADDON_PACKAGE drifted from the component table"
		);
		assert!(
			MANIFEST.contains(&format!(
				"<uses-permission android:name=\"{MINT_TOKEN_PERMISSION}\" />"
			)),
			"the manifest no longer asks for {MINT_TOKEN_PERMISSION}, so the add-on refuses to mint"
		);
		assert!(
			MINT_TOKEN_PERMISSION.starts_with(&format!("{addon}.")),
			"the component table package {addon} no longer owns {MINT_TOKEN_PERMISSION}"
		);
		for (constant, published) in [
			(
				"MINT_TOKEN_ACTION",
				"org.opengrind.recaptcha.action.MINT_TOKEN",
			),
			("EXTRA_ACTION", "org.opengrind.recaptcha.extra.ACTION"),
			("EXTRA_TOKEN", "org.opengrind.recaptcha.extra.TOKEN"),
			("EXTRA_ERROR", "org.opengrind.recaptcha.extra.ERROR"),
			(
				"EXTRA_ERROR_DETAIL",
				"org.opengrind.recaptcha.extra.ERROR_DETAIL",
			),
		] {
			assert_eq!(
				kotlin_constant(RECAPTCHA_PLUGIN, file, constant),
				published,
				"{file} {constant} drifted from the add-on's published contract"
			);
		}
		let registered = squashed(RECAPTCHA_BRIDGE);
		let package = kotlin_package(RECAPTCHA_PLUGIN, file);
		assert!(
			registered.contains(&format!(
				"register_android_plugin(\"{package}\",\"RecaptchaPlugin\",)"
			)) && spaced_match(RECAPTCHA_PLUGIN, "class RecaptchaPlugin(").is_some(),
			"recaptcha/android.rs registers a plugin class that {file} does not declare"
		);
	}

	#[test]
	fn the_kotlin_signer_pin_matches_the_published_jks_fingerprint() {
		let published = KEYS
			.lines()
			.skip_while(|line| !line.contains("Android JKS"))
			.map(str::trim)
			.find(|line| hex64(line))
			.expect("KEYS.md publishes no Android JKS fingerprint");
		let start = GATE
			.find("RELEASE_CERT_SHA256")
			.expect("pin in InstallGate");
		let literal = GATE[start..]
			.split('"')
			.nth(1)
			.expect("pin holds a string literal");

		assert!(
			literal.eq_ignore_ascii_case(published),
			"pin drifted from KEYS.md"
		);
		assert!(
			literal.chars().all(|c| !c.is_ascii_lowercase()),
			"soleSignerOf emits uppercase hex and the comparison is case-sensitive"
		);
	}

	#[test]
	fn the_linux_suffix_matches_the_appimage_name_the_build_writes() {
		assert_eq!(
			suffix_for("linux", "x86_64").unwrap(),
			"-linux-x86_64.AppImage"
		);
		assert_eq!(
			suffix_for("linux", "aarch64").unwrap(),
			"-linux-arm64.AppImage"
		);
		assert!(
			LINUX_BUILD.contains("-linux-$arch.AppImage"),
			"build.sh no longer writes the name the updater asks for"
		);
		assert!(
			LINUX_BUILD.contains("aarch64) arch=arm64"),
			"build.sh no longer maps aarch64 to arm64"
		);
	}

	#[cfg(target_os = "linux")]
	#[test]
	fn a_linux_install_that_is_not_an_appimage_is_offered_nothing() {
		assert!(
			super::release_asset_suffix().is_none(),
			"a .deb install must leave updates to the package manager"
		);
	}

	#[test]
	fn the_update_components_stay_unexported() {
		for component in ["InstallResultReceiver", "TransferService"] {
			let at = MANIFEST.find(component).expect(component);
			let element = &MANIFEST
				[at..MANIFEST[at..].find('>').map(|i| at + i).unwrap()];
			assert!(
				element.contains("android:exported=\"false\""),
				"{component} must not be exported"
			);
		}
	}

	#[test]
	fn the_play_overlay_removes_the_updater_the_main_manifest_declares() {
		use super::super::component::SELF_PACKAGE;

		let qualified = |name: &str| match name.strip_prefix('.') {
			Some(relative) => format!("{SELF_PACKAGE}.{relative}"),
			None => name.to_owned(),
		};
		let declared = |source: &'static str| {
			xml_elements(source).filter_map(move |(tag, element)| {
				xml_attribute(element, "android:name")
					.map(|name| (tag, qualified(name), element))
			})
		};
		let removed: Vec<(&str, String)> = declared(PLAY_OVERLAY)
			.filter(|(_, _, element)| {
				xml_attribute(element, "tools:node") == Some("remove")
			})
			.map(|(tag, name, _)| (tag, name))
			.collect();

		for (tag, name) in &removed {
			assert!(
				declared(MANIFEST).any(|(main_tag, main_name, _)| {
					main_tag == *tag && main_name == *name
				}),
				"the Play overlay removes <{tag}> {name}, which the main manifest does not declare, so whatever replaced it ships on Play"
			);
		}
		assert!(
			removed.contains(&(
				"uses-permission",
				"android.permission.REQUEST_INSTALL_PACKAGES".to_owned()
			)),
			"the Play overlay no longer removes REQUEST_INSTALL_PACKAGES"
		);

		let update_package = kotlin_package(PLUGIN, "UpdatePlugin.kt");
		let updater: Vec<(&str, String)> = declared(MANIFEST)
			.filter(|(tag, name, _)| {
				["activity", "service", "receiver", "provider"].contains(tag)
					&& name.starts_with(&format!("{update_package}."))
			})
			.map(|(tag, name, _)| (tag, name))
			.collect();
		assert!(
			!updater.is_empty(),
			"the main manifest declares no component from {update_package}"
		);
		for (tag, name) in updater {
			assert!(
				removed.contains(&(tag, name.clone())),
				"the Play overlay keeps the updater's <{tag}> {name}"
			);
		}
	}

	#[test]
	fn a_media_upload_holds_the_transfer_service_under_its_own_title() {
		assert_eq!(
			kotlin_constant(TRANSFER_TITLE, "TransferTitle.kt", "MEDIA_UPLOAD"),
			super::MEDIA_UPLOAD,
			"the upload purpose the bridge sends is not the one TransferTitle reads"
		);
		let service = squashed(TRANSFER_SERVICE);
		assert!(
			service.contains(
				"funstart(context:Context,transfer:Transfer,){holds.begin(transfer)context.startForegroundService("
			),
			"TransferService no longer restarts on every hold"
		);
		assert!(
			service.contains(
				"funstop(context:Context,transfer:Transfer,){holds.end(transfer)ContextCompat.getMainExecutor(context).execute{running?.get()?.settle()}}"
			) && !service.contains("stopService("),
			"TransferService is stopped from outside instead of stopping itself on the main thread"
		);
		assert!(
			service.contains(
				"}catch(e:Exception){stopIfLatest(startId)returnSTART_NOT_STICKY}foregroundStartId=startIdsettle()"
			) && service.contains(
				"privatefunsettle(){valstartId=foregroundStartId?:returnvalshowing=holds.newest()if(showing==null){stopIfLatest(startId)return}"
			),
			"TransferService can stop before it entered the foreground or while a transfer still runs"
		);
	}
}
