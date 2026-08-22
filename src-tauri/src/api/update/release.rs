use semver::Version;
use serde::{Deserialize, Serialize};

use super::client;
use super::error::UpdateError;

const INDEX_PATH: &str =
	"api/v1/repos/open-grind/open-grind/releases?limit=3&draft=false";
const INDEX_MAX_BYTES: usize = 256 * 1024;
const MAX_PAYLOAD_BYTES: u64 = 512 * 1024 * 1024;

pub fn payload_name(tag: &str, suffix: &str) -> String {
	format!("open-grind-{tag}{suffix}")
}

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
	pub tag: String,
	pub version: String,
	pub notes: Option<String>,
	pub published_at: Option<String>,
	pub payload: Artifact,
	pub signature: Artifact,
}

impl Candidate {
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

pub async fn fetch_index(current: &Version) -> Result<String, UpdateError> {
	let client = client::build()?;
	let mut index_url = format!("{}{INDEX_PATH}", client::origin());
	if current.pre.is_empty() {
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
	current: &Version,
	payload_suffix: &str,
) -> Result<Option<Candidate>, UpdateError> {
	let releases: Vec<IndexRelease> = serde_json::from_str(index)
		.map_err(|e| UpdateError::MalformedIndex(e.to_string()))?;

	let mut newest: Option<(Version, IndexRelease)> = None;
	for release in releases {
		if release.draft {
			continue;
		}
		if release.prerelease && current.pre.is_empty() {
			continue;
		}
		let Some(version) = parse_version(&release.tag_name) else {
			continue;
		};
		if version <= *current {
			continue;
		}
		if newest.as_ref().is_some_and(|(found, _)| version <= *found) {
			continue;
		}
		newest = Some((version, release));
	}

	newest
		.map(|(version, release)| {
			build_candidate(release, &version, payload_suffix)
		})
		.transpose()
}

fn build_candidate(
	release: IndexRelease,
	version: &Version,
	payload_suffix: &str,
) -> Result<Candidate, UpdateError> {
	let wanted = payload_name(&release.tag_name, payload_suffix);
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

	#[test]
	fn offers_a_newer_release() {
		let found = newest_upgrade(
			&index(&[&release("0.1.0-beta.4", true)]),
			&current("0.1.0-beta.3"),
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
			let found = newest_upgrade(
				&index(&[&release(tag, true)]),
				&current("0.1.0-beta.3"),
				".apk",
			)
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
		let found = newest_upgrade(&json, &current("0.1.0-beta.1"), ".apk")
			.unwrap()
			.unwrap();
		assert_eq!(found.version, "0.2.0-beta.1");
	}

	#[test]
	fn a_stable_install_is_never_offered_a_prerelease() {
		let json =
			index(&[&release("1.1.0-rc.1", true), &release("1.0.1", false)]);
		let found = newest_upgrade(&json, &current("1.0.0"), ".apk")
			.unwrap()
			.unwrap();
		assert_eq!(found.version, "1.0.1");
	}

	#[test]
	fn a_prerelease_install_may_move_to_a_stable_release() {
		let json = index(&[&release("0.1.0", false)]);
		let found = newest_upgrade(&json, &current("0.1.0-beta.3"), ".apk")
			.unwrap()
			.unwrap();
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
			newest_upgrade(&index(&[&unsigned()]), &current("0.1.0"), ".apk")
				.unwrap_err();
		let UpdateError::Unsigned { tag } = &error else {
			panic!("{error:?}");
		};
		assert_eq!(tag, "v0.2.0");
	}

	#[test]
	fn only_the_exact_conventional_name_is_offered() {
		let two = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {"name":"open-grind-v0.2.0-arm64.apk","size":1,"uuid":"a",
             "browser_download_url":"https://git.opengrind.org/a.apk"},
            {"name":"open-grind-v0.2.0.apk","size":1,"uuid":"b",
             "browser_download_url":"https://git.opengrind.org/b.apk"},
            {"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"c",
             "browser_download_url":"https://git.opengrind.org/b.apk.minisig"}]}"#;
		let found = newest_upgrade(&index(&[two]), &current("0.1.0"), ".apk")
			.unwrap()
			.unwrap();
		assert_eq!(found.payload.name, "open-grind-v0.2.0.apk");
	}

	#[test]
	fn an_asset_named_off_convention_is_no_artifact() {
		let renamed = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {"name":"opengrind-latest.apk","size":1,"uuid":"a",
             "browser_download_url":"https://git.opengrind.org/a.apk"}]}"#;
		let error =
			newest_upgrade(&index(&[renamed]), &current("0.1.0"), ".apk")
				.unwrap_err();
		assert!(matches!(error, UpdateError::NoArtifact), "{error:?}");
	}

	#[test]
	fn an_implausible_payload_size_is_refused() {
		for size in ["0", "549755813889"] {
			let bloated = format!(
				r#"{{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
                {{"name":"open-grind-v0.2.0.apk","size":{size},"uuid":"a",
                 "browser_download_url":"https://git.opengrind.org/a.apk"}},
                {{"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"b",
                 "browser_download_url":"https://git.opengrind.org/a.apk.minisig"}}]}}"#
			);
			let error =
				newest_upgrade(&index(&[&bloated]), &current("0.1.0"), ".apk")
					.unwrap_err();
			assert!(
				matches!(error, UpdateError::MalformedIndex(_)),
				"accepted size {size}: {error:?}"
			);
		}
	}

	#[test]
	fn a_release_without_a_payload_is_an_error_not_a_skip() {
		let no_apk = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[]}"#;
		let error =
			newest_upgrade(&index(&[no_apk]), &current("0.1.0"), ".apk")
				.unwrap_err();
		assert!(matches!(error, UpdateError::NoArtifact), "{error:?}");
	}

	#[test]
	fn an_unsigned_newest_release_never_falls_back_to_an_older_signed_one() {
		let json = index(&[&unsigned(), &release("0.1.5", false)]);
		let error =
			newest_upgrade(&json, &current("0.1.0"), ".apk").unwrap_err();
		assert!(matches!(error, UpdateError::Unsigned { .. }), "{error:?}");
	}

	#[test]
	fn an_unsigned_release_the_install_has_passed_is_ignored() {
		let json = index(&[&unsigned(), &release("0.3.0", false)]);
		let found = newest_upgrade(&json, &current("0.2.0"), ".apk")
			.unwrap()
			.unwrap();
		assert_eq!(found.version, "0.3.0");
	}

	#[test]
	fn refuses_artifacts_hosted_elsewhere() {
		let offsite = r#"{"tag_name":"v0.2.0","draft":false,"prerelease":false,"assets":[
            {"name":"open-grind-v0.2.0.apk","size":1,"uuid":"a",
             "browser_download_url":"https://evil.example/open-grind-0.2.0.apk"},
            {"name":"open-grind-v0.2.0.apk.minisig","size":228,"uuid":"b",
             "browser_download_url":"https://evil.example/open-grind-0.2.0.apk.minisig"}]}"#;
		let error =
			newest_upgrade(&index(&[offsite]), &current("0.1.0"), ".apk")
				.unwrap_err();
		assert!(matches!(error, UpdateError::ForeignUrl(_)));
	}

	#[test]
	fn skips_drafts_and_unparsable_tags() {
		let draft = r#"{"tag_name":"v9.9.9","draft":true,"prerelease":false,"assets":[]}"#;
		let nightly = r#"{"tag_name":"nightly","draft":false,"prerelease":false,"assets":[]}"#;
		assert!(newest_upgrade(
			&index(&[draft, nightly]),
			&current("0.1.0"),
			".apk"
		)
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
