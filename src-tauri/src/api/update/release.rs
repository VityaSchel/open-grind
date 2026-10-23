use semver::Version;
use serde::{Deserialize, Serialize};

use super::baseline::{Baseline, Channel, InstallKind};
use super::client;
use super::component::Component;
use super::error::UpdateError;

const INDEX_MAX_BYTES: usize = 256 * 1024;
const MAX_PAYLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Deserialize)]
struct IndexRelease {
	tag_name: String,
	#[serde(default)]
	draft: bool,
	#[serde(default)]
	prerelease: bool,
	body: Option<String>,
	published_at: Option<String>,
	#[serde(default)]
	assets: Vec<IndexAsset>,
}

#[derive(Debug, Deserialize)]
struct IndexAsset {
	name: String,
	size: u64,
	uuid: String,
	browser_download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
	pub name: String,
	pub url: String,
	pub uuid: String,
	pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
	pub component: String,
	pub kind: InstallKind,
	pub tag: String,
	pub version: String,
	pub notes: Option<String>,
	pub published_at: Option<String>,
	pub payload: Artifact,
	pub signature: Artifact,
}

impl Candidate {
	pub(super) fn fits(&self, baseline: &Baseline) -> bool {
		self.kind == baseline.kind()
			&& Version::parse(&self.version).is_ok_and(|version| {
				baseline.accepts_stage(self.kind, &version)
			})
	}

	pub(super) fn admitted(self) -> Result<Self, UpdateError> {
		client::assert_release_origin(&self.payload.url)?;
		client::assert_release_origin(&self.signature.url)?;
		if self.payload.size == 0 || self.payload.size > MAX_PAYLOAD_BYTES {
			return Err(UpdateError::MalformedIndex(format!(
				"{} declares an implausible size for {}",
				self.tag, self.payload.name
			)));
		}
		Ok(self)
	}
}

pub async fn fetch_index(
	component: &Component,
	channel: Channel,
) -> Result<String, UpdateError> {
	let client = client::build()?;
	let mut index_url = format!("{}{}", client::origin(), component.index_path);
	if !channel.accepts_prereleases() {
		index_url.push_str("&pre-release=false");
	}
	let response = client::get(&client, &index_url)
		.send()
		.await
		.map_err(|e| UpdateError::Network(e.to_string()))?;

	let status = response.status();
	if !status.is_success() {
		return Err(UpdateError::Server {
			status: status.as_u16(),
		});
	}
	client::text_within(response, INDEX_MAX_BYTES, UpdateError::MalformedIndex)
		.await
}

fn parse_version(tag: &str) -> Option<Version> {
	Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()
}

pub fn newest_upgrade(
	index: &str,
	component: &Component,
	baseline: &Baseline,
	channel: Channel,
	payload_suffix: &str,
) -> Result<Option<Candidate>, UpdateError> {
	let releases: Vec<IndexRelease> = serde_json::from_str(index)
		.map_err(|e| UpdateError::MalformedIndex(e.to_string()))?;

	let mut newest: Option<(Version, IndexRelease)> = None;
	for release in releases {
		if release.draft {
			continue;
		}
		let Some(version) = parse_version(&release.tag_name) else {
			continue;
		};
		let prerelease = release.prerelease || !version.pre.is_empty();
		if prerelease && !channel.accepts_prereleases() {
			continue;
		}
		if !baseline.superseded_by(&version) {
			continue;
		}
		if newest.as_ref().is_some_and(|(found, _)| version <= *found) {
			continue;
		}
		newest = Some((version, release));
	}

	newest
		.map(|(version, release)| {
			build_candidate(
				release,
				component,
				baseline,
				&version,
				payload_suffix,
			)
		})
		.transpose()
}

fn build_candidate(
	release: IndexRelease,
	component: &Component,
	baseline: &Baseline,
	version: &Version,
	payload_suffix: &str,
) -> Result<Candidate, UpdateError> {
	let wanted = component.payload_name(&release.tag_name, payload_suffix);
	let Some(payload) =
		release.assets.iter().find(|asset| asset.name == wanted)
	else {
		return Err(UpdateError::NoArtifact);
	};
	let signature_name = format!("{wanted}.minisig");
	let Some(signature) = release
		.assets
		.iter()
		.find(|asset| asset.name == signature_name)
	else {
		return Err(UpdateError::Unsigned {
			tag: release.tag_name,
		});
	};

	Candidate {
		component: component.key.to_owned(),
		kind: baseline.kind(),
		tag: release.tag_name,
		version: version.to_string(),
		notes: release.body,
		published_at: release.published_at,
		payload: artifact(payload),
		signature: artifact(signature),
	}
	.admitted()
}

fn artifact(asset: &IndexAsset) -> Artifact {
	Artifact {
		name: asset.name.clone(),
		url: asset.browser_download_url.clone(),
		uuid: asset.uuid.clone(),
		size: asset.size,
	}
}

#[cfg(test)]
mod tests {
	use super::super::baseline::Channel;
	use super::super::component::APP;
	use super::*;

	fn index(entries: &[&str]) -> String {
		format!("[{}]", entries.join(","))
	}

	fn release(tag: &str, prerelease: bool) -> String {
		let origin = client::origin();
		format!(
			r#"{{"tag_name":"{tag}","draft":false,"prerelease":{prerelease},"body":"notes",
            "published_at":"2026-07-19T19:05:36+02:00","assets":[
              {{"name":"open-grind-{tag}.apk","size":72294080,"uuid":"bb49c042",
               "browser_download_url":"{origin}download/open-grind-{tag}.apk"}},
              {{"name":"open-grind-{tag}.apk.minisig","size":228,"uuid":"c45b10ab",
               "browser_download_url":"{origin}download/open-grind-{tag}.apk.minisig"}}]}}"#
		)
	}

	fn current(v: &str) -> Version {
		Version::parse(v).unwrap()
	}

	fn host(v: &str) -> super::super::baseline::HostVersion {
		super::super::baseline::HostVersion::of(current(v))
	}

	fn upgrade(
		index: &str,
		installed: &str,
		payload_suffix: &str,
	) -> Result<Option<Candidate>, UpdateError> {
		newest_upgrade(
			index,
			&APP,
			&Baseline::of_version(current(installed)),
			Channel::of_host(&host(installed)),
			payload_suffix,
		)
	}

	fn offer(
		index: &str,
		baseline: &Baseline,
		channel: Channel,
	) -> Option<Candidate> {
		newest_upgrade(index, &APP, baseline, channel, ".apk").unwrap()
	}

	#[test]
	fn the_channel_decides_prereleases_and_the_baseline_never_does() {
		let stable = Channel::of_host(&host("1.0.0"));
		let prerelease_baseline = Baseline::of_version(current("0.1.0-beta.3"));
		let index = index(&[&release("9.9.9-rc.1", true)]);

		assert!(
			offer(&index, &prerelease_baseline, stable).is_none(),
			"a prerelease baseline must not unlock the prerelease channel"
		);
		assert!(offer(
			&index,
			&prerelease_baseline,
			Channel::of_host(&host("1.0.0-beta.1"))
		)
		.is_some());
	}

	#[test]
	fn an_absent_target_is_offered_the_newest_release() {
		let found = offer(
			&index(&[&release("1.0.0", false), &release("2.0.0", false)]),
			&Baseline::Absent,
			Channel::of_host(&host("1.0.0")),
		)
		.unwrap();
		assert_eq!(found.version, "2.0.0");
		assert_eq!(found.kind, InstallKind::Install);
	}

	#[test]
	fn an_installed_target_is_offered_an_update_not_an_install() {
		let found = offer(
			&index(&[&release("2.0.0", false)]),
			&Baseline::of_version(current("1.0.0")),
			Channel::of_host(&host("1.0.0")),
		)
		.unwrap();
		assert_eq!(found.kind, InstallKind::Update);
		assert_eq!(found.component, "app");
	}

	#[test]
	fn an_offer_fits_only_the_target_state_it_was_built_for() {
		let index = index(&[&release("2.0.0", false)]);
		let channel = Channel::of_host(&host("1.0.0"));
		let older = Baseline::of_version(current("1.0.0"));
		let update = offer(&index, &older, channel).unwrap();
		let install = offer(&index, &Baseline::Absent, channel).unwrap();

		assert!(update.fits(&older));
		assert!(install.fits(&Baseline::Absent));
		assert!(
			!update.fits(&Baseline::Absent),
			"the target was removed after the check"
		);
		assert!(
			!install.fits(&older),
			"the target was installed after the check"
		);
		assert!(
			!update.fits(&Baseline::of_version(current("2.0.0"))),
			"the target already reached the offered version"
		);
	}

	#[test]
	fn an_unorderable_target_is_offered_nothing() {
		let index = index(&[&release("9.9.9", false)]);
		let channel = Channel::of_host(&host("1.0.0"));
		assert!(offer(
			&index,
			&Baseline::Opaque {
				name: Some("build-7".into()),
			},
			channel
		)
		.is_none());
		assert!(offer(
			&index,
			&Baseline::Unreadable {
				why: "probe failed".into()
			},
			channel
		)
		.is_none());
	}

	#[test]
	fn offers_a_newer_release() {
		let found = upgrade(
			&index(&[&release("0.1.0-beta.4", true)]),
			"0.1.0-beta.3",
			".apk",
		)
		.unwrap()
		.unwrap();
		assert_eq!(found.version, "0.1.0-beta.4");
		assert_eq!(found.payload.size, 72294080);
		assert_eq!(found.signature.name, "open-grind-0.1.0-beta.4.apk.minisig");
	}

	#[test]
	fn ignores_the_running_version_and_older_ones() {
		for tag in ["0.1.0-beta.3", "0.1.0-beta.2", "0.0.9"] {
			let found =
				upgrade(&index(&[&release(tag, true)]), "0.1.0-beta.3", ".apk")
					.unwrap();
			assert!(found.is_none(), "offered {tag}");
		}
	}

	#[test]
	fn picks_the_highest_version_not_the_first_entry() {
		let json = index(&[
			&release("0.1.0-beta.2", true),
			&release("0.2.0-beta.1", true),
			&release("0.1.0-beta.4", true),
		]);
		let found = upgrade(&json, "0.1.0-beta.1", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "0.2.0-beta.1");
	}

	#[test]
	fn a_stable_install_is_never_offered_a_prerelease() {
		let json =
			index(&[&release("1.1.0-rc.1", true), &release("1.0.1", false)]);
		let found = upgrade(&json, "1.0.0", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "1.0.1");
	}

	#[test]
	fn a_stable_install_trusts_the_signed_tag_over_the_index_flag() {
		let mislabeled =
			index(&[&release("1.1.0-rc.1", false), &release("1.0.1", false)]);
		let found = upgrade(&mislabeled, "1.0.0", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "1.0.1");

		let only_mislabeled = index(&[&release("v1.1.0-beta.2", false)]);
		assert!(
			upgrade(&only_mislabeled, "1.0.0", ".apk").unwrap().is_none(),
			"an index that drops the prerelease flag must not reach stable installs"
		);
	}

	#[test]
	fn a_prerelease_install_still_takes_a_prerelease_tag() {
		let json = index(&[&release("0.1.0-beta.5", false)]);
		let found = upgrade(&json, "0.1.0-beta.4", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "0.1.0-beta.5");
	}

	#[test]
	fn a_prerelease_install_may_move_to_a_stable_release() {
		let json = index(&[&release("0.1.0", false)]);
		let found = upgrade(&json, "0.1.0-beta.3", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "0.1.0");
	}

	fn unsigned() -> String {
		format!(
			r#"{{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {{"name":"open-grind-v0.2.0.apk","size":1,"uuid":"a",
             "browser_download_url":"{}x.apk"}}]}}"#,
			client::origin()
		)
	}

	#[test]
	fn an_unsigned_release_is_an_error_not_a_skip() {
		let error =
			upgrade(&index(&[&unsigned()]), "0.1.0", ".apk").unwrap_err();
		let UpdateError::Unsigned { tag } = &error else {
			panic!("{error:?}");
		};
		assert_eq!(tag, "v0.2.0");
	}

	#[test]
	fn only_the_exact_conventional_name_is_offered() {
		let origin = client::origin();
		let two = format!(
			r#"{{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {{"name":"open-grind-v0.2.0-arm64.apk","size":1,"uuid":"a",
             "browser_download_url":"{origin}a.apk"}},
            {{"name":"open-grind-v0.2.0.apk","size":1,"uuid":"b",
             "browser_download_url":"{origin}b.apk"}},
            {{"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"c",
             "browser_download_url":"{origin}b.apk.minisig"}}]}}"#
		);
		let found = upgrade(&index(&[&two]), "0.1.0", ".apk").unwrap().unwrap();
		assert_eq!(found.payload.name, "open-grind-v0.2.0.apk");
	}

	#[test]
	fn an_asset_named_off_convention_is_no_artifact() {
		let renamed = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {"name":"opengrind-latest.apk","size":1,"uuid":"a",
             "browser_download_url":"https://git.opengrind.org/a.apk"}]}"#;
		let error = upgrade(&index(&[renamed]), "0.1.0", ".apk").unwrap_err();
		assert!(matches!(error, UpdateError::NoArtifact), "{error:?}");
	}

	#[test]
	fn an_implausible_payload_size_is_refused() {
		let origin = client::origin();
		for size in ["0", "549755813889"] {
			let bloated = format!(
				r#"{{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
                {{"name":"open-grind-v0.2.0.apk","size":{size},"uuid":"a",
                 "browser_download_url":"{origin}a.apk"}},
                {{"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"b",
                 "browser_download_url":"{origin}a.apk.minisig"}}]}}"#
			);
			let error =
				upgrade(&index(&[&bloated]), "0.1.0", ".apk").unwrap_err();
			assert!(
				matches!(error, UpdateError::MalformedIndex(_)),
				"accepted size {size}: {error:?}"
			);
		}
	}

	#[test]
	fn a_release_without_a_payload_is_an_error_not_a_skip() {
		let no_apk = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[]}"#;
		let error = upgrade(&index(&[no_apk]), "0.1.0", ".apk").unwrap_err();
		assert!(matches!(error, UpdateError::NoArtifact), "{error:?}");
	}

	#[test]
	fn an_unsigned_newest_release_never_falls_back_to_an_older_signed_one() {
		let json = index(&[&unsigned(), &release("0.1.5", false)]);
		let error = upgrade(&json, "0.1.0", ".apk").unwrap_err();
		assert!(matches!(error, UpdateError::Unsigned { .. }), "{error:?}");
	}

	#[test]
	fn an_unsigned_release_the_install_has_passed_is_ignored() {
		let json = index(&[&unsigned(), &release("0.3.0", false)]);
		let found = upgrade(&json, "0.2.0", ".apk").unwrap().unwrap();
		assert_eq!(found.version, "0.3.0");
	}

	#[test]
	fn refuses_artifacts_hosted_elsewhere() {
		let offsite = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {"name":"open-grind-v0.2.0.apk","size":1,"uuid":"a",
             "browser_download_url":"https://evil.example/open-grind-0.2.0.apk"},
            {"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"b",
             "browser_download_url":"https://evil.example/open-grind-0.2.0.apk.minisig"}]}"#;
		let error = upgrade(&index(&[offsite]), "0.1.0", ".apk").unwrap_err();
		assert!(matches!(error, UpdateError::ForeignUrl(_)));
	}

	#[test]
	fn skips_drafts_and_unparsable_tags() {
		let draft = r#"{"tag_name":"v9.9.9","draft":true,"prerelease":false,"assets":[]}"#;
		let nightly = r#"{"tag_name":"nightly","draft":false,"prerelease":false,"assets":[]}"#;
		assert!(upgrade(&index(&[draft, nightly]), "0.1.0", ".apk")
			.unwrap()
			.is_none());
	}

	#[test]
	fn tags_parse_with_and_without_the_v_prefix() {
		assert_eq!(
			parse_version("v0.1.0-beta.3"),
			Some(current("0.1.0-beta.3"))
		);
		assert_eq!(
			parse_version("0.1.0-alpha.5"),
			Some(current("0.1.0-alpha.5"))
		);
		assert_eq!(parse_version("main"), None);
	}
}
