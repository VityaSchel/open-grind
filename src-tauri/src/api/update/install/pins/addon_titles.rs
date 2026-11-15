use super::components_ts_table;
use crate::api::update::component;
use crate::pin_support::squashed;

const UPDATES_CATALOG: &str =
	include_str!("../../../../../../src/lib/i18n/locales/en/updates.json");

const ADDON_NAMES: &str = include_str!(
	"../../../../../gen/android/app/src/main/java/org/opengrind/addon/AddonNames.kt"
);

const ANDROID_STRINGS: &str =
	include_str!("../../../../../../src/lib/i18n/android-strings.json");

fn updates_message(key: &str) -> String {
	let catalog: serde_json::Value = serde_json::from_str(UPDATES_CATALOG)
		.expect("en/updates.json is not JSON");
	let path = key
		.strip_prefix("updates.")
		.unwrap_or_else(|| panic!("{key} is not a message in en/updates.json"));
	catalog
		.pointer(&format!("/{}", path.replace('.', "/")))
		.and_then(serde_json::Value::as_str)
		.unwrap_or_else(|| panic!("en/updates.json has no {key}"))
		.to_owned()
}

fn addon_titles_arm(package: &str) -> Vec<String> {
	let source = squashed(ADDON_NAMES);
	let opening = format!("\"{package}\"->AddonTitles(");
	let start = source.find(&opening).unwrap_or_else(|| {
		panic!("AddonNames.kt has no AddonTitles for {package}")
	}) + opening.len();
	let arm = &source[start..];
	let arm = &arm[..arm.find(')').unwrap_or_else(|| {
		panic!("AddonNames.kt leaves the {package} titles open")
	})];
	let mut fields: Vec<String> = arm
		.split(',')
		.filter(|field| !field.is_empty())
		.map(str::to_owned)
		.collect();
	fields.sort();
	fields
}

#[test]
fn every_addon_download_notification_shows_the_app_s_download_title() {
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

	let resources: serde_json::Value = serde_json::from_str(ANDROID_STRINGS)
		.expect("android-strings.json is not JSON");
	for (key, message) in names {
		let addon =
			message.strip_suffix(".name").unwrap_or_else(|| {
				panic!("ADDON_NAME maps {key} to {message}, not to an add-on's name")
			});
		let package = component::by_key(&key).unwrap().install_target();
		let mut fields = Vec::new();
		for kind in ["install", "update"] {
			let resource = format!(
				"addon_{kind}_transfer_title_{}",
				key.replace('-', "_")
			);
			let title = format!("{addon}.stage.{kind}.downloading");
			updates_message(&title);
			assert_eq!(
				resources.get(&resource).and_then(serde_json::Value::as_str),
				Some(title.as_str()),
				"android-strings.json must map {resource} to {title}, so the download notification names the add-on as the app does"
			);
			fields.push(format!("{kind}=R.string.{resource}"));
		}
		assert_eq!(
			addon_titles_arm(package),
			fields,
			"AddonNames.kt does not map {package} to its own install and update titles"
		);
	}
}
