use std::collections::HashMap;

use grindr::Bytes;

const MAX_ENTRY_BYTES: usize = super::MAX_MEDIA_BYTES;
const LARGE_ENTRY_BYTES: usize = 128 * 1024;
const SMALL_BUDGET_BYTES: usize = 32 * 1024 * 1024;
const LARGE_BUDGET_BYTES: usize = 2 * MAX_ENTRY_BYTES;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Class {
	Small = 0,
	Large = 1,
}

impl Class {
	fn of(len: usize) -> Self {
		if len > LARGE_ENTRY_BYTES {
			Self::Large
		} else {
			Self::Small
		}
	}

	fn budget(self) -> usize {
		match self {
			Self::Small => SMALL_BUDGET_BYTES,
			Self::Large => LARGE_BUDGET_BYTES,
		}
	}
}

#[derive(Clone)]
pub struct CachedMedia {
	pub content_type: Option<String>,
	pub body: Bytes,
}

struct Entry {
	last_used: u64,
	media: CachedMedia,
}

impl Entry {
	fn class(&self) -> Class {
		Class::of(self.media.body.len())
	}
}

#[derive(Default)]
pub struct MediaCache {
	entries: HashMap<String, Entry>,
	bytes: [usize; 2],
	clock: u64,
}

pub fn cache_key(url: &str) -> &str {
	let Some((base, query)) = url.split_once('?') else {
		return url;
	};
	let signature_rotates_per_fetch =
		base.contains("cloudfront.net") && query.contains("Signature");
	if signature_rotates_per_fetch {
		base
	} else {
		url
	}
}

impl MediaCache {
	pub fn get(&mut self, key: &str) -> Option<CachedMedia> {
		self.clock += 1;
		let entry = self.entries.get_mut(key)?;
		entry.last_used = self.clock;
		Some(entry.media.clone())
	}

	pub fn put(&mut self, key: &str, media: CachedMedia) {
		if media.body.len() > MAX_ENTRY_BYTES {
			return;
		}
		self.clock += 1;
		self.remove(key);
		let class = Class::of(media.body.len());
		self.bytes[class as usize] += media.body.len();
		self.entries.insert(
			key.to_owned(),
			Entry {
				last_used: self.clock,
				media,
			},
		);
		self.evict(class);
	}

	pub fn clear(&mut self) {
		self.entries.clear();
		self.bytes = [0; 2];
	}

	fn evict(&mut self, class: Class) {
		while self.bytes[class as usize] > class.budget() {
			let Some(oldest) = self
				.entries
				.iter()
				.filter(|(_, entry)| entry.class() == class)
				.min_by_key(|(_, entry)| entry.last_used)
				.map(|(key, _)| key.clone())
			else {
				break;
			};
			self.remove(&oldest);
		}
	}

	fn remove(&mut self, key: &str) {
		if let Some(entry) = self.entries.remove(key) {
			self.bytes[entry.class() as usize] -= entry.media.body.len();
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn media(size: usize) -> CachedMedia {
		CachedMedia {
			content_type: Some("image/jpeg".to_owned()),
			body: Bytes::from(vec![0u8; size]),
		}
	}

	fn cache_of(entries: &[(&str, usize)]) -> MediaCache {
		let mut cache = MediaCache::default();
		for (key, size) in entries {
			cache.put(key, media(*size));
		}
		cache
	}

	#[test]
	fn a_signed_cloudfront_url_keys_on_everything_but_its_signature() {
		let key = cache_key(
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=xy&Key-Pair-Id=K1",
		);
		assert_eq!(key, "https://d3lyqctnm3b6pb.cloudfront.net/a.jpg");
	}

	#[test]
	fn every_other_url_keys_on_itself() {
		for url in [
			"https://cdns.grindr.com/images/thumb/320x320/abc",
			"https://cdns.grindr.com/images/thumb/320x320/abc?v=2",
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1",
		] {
			assert_eq!(cache_key(url), url);
		}
	}

	#[test]
	fn a_stored_entry_comes_back_whole() {
		let mut cache = cache_of(&[("a", 8)]);

		let hit = cache.get("a").expect("stored entry");
		assert_eq!(hit.body.len(), 8);
		assert_eq!(hit.content_type.as_deref(), Some("image/jpeg"));
		assert!(cache.get("b").is_none());
	}

	#[test]
	fn re_storing_a_key_does_not_double_count_its_bytes() {
		let cache = cache_of(&[("a", 1024), ("a", 1024)]);

		assert_eq!(cache.bytes, [1024, 0]);
		assert_eq!(cache.entries.len(), 1);
	}

	#[test]
	fn an_entry_too_large_to_be_worth_holding_is_not_stored() {
		let mut cache = cache_of(&[("big", MAX_ENTRY_BYTES + 1)]);

		assert!(cache.get("big").is_none());
		assert_eq!(cache.bytes, [0, 0]);
	}

	#[test]
	fn a_thumbnail_sized_entry_stays_out_of_the_large_budget() {
		let cache = cache_of(&[
			("thumb", LARGE_ENTRY_BYTES),
			("photo", LARGE_ENTRY_BYTES + 1),
		]);

		assert_eq!(cache.bytes, [LARGE_ENTRY_BYTES, LARGE_ENTRY_BYTES + 1]);
	}

	#[test]
	fn the_least_recently_used_entry_is_evicted_first() {
		let entry = 4 * 1024 * 1024;
		let fits = Class::Large.budget() / entry;
		let mut cache = MediaCache::default();
		for index in 0..fits {
			cache.put(&format!("photo{index}"), media(entry));
		}
		cache.get("photo0").expect("photo0 is still cached");

		cache.put("last", media(entry));

		assert!(cache.bytes[Class::Large as usize] <= Class::Large.budget());
		assert!(
			cache.get("photo0").is_some(),
			"photo0 was used more recently than photo1"
		);
		assert!(cache.get("photo1").is_none());
	}

	#[test]
	fn large_media_never_evicts_the_thumbnail_working_set() {
		let thumb = 32 * 1024;
		let photo = LARGE_ENTRY_BYTES + 1;
		let mut cache = MediaCache::default();
		for index in 0..100 {
			cache.put(&format!("thumb{index}"), media(thumb));
		}

		for index in 0..(Class::Large.budget() / photo + 2) {
			cache.put(&format!("photo{index}"), media(photo));
		}

		assert!(cache.bytes[Class::Large as usize] <= Class::Large.budget());
		assert_eq!(cache.bytes[Class::Small as usize], 100 * thumb);
		for index in 0..100 {
			assert!(
				cache.get(&format!("thumb{index}")).is_some(),
				"thumb{index} was evicted by full-size media"
			);
		}
	}

	#[test]
	fn a_second_full_size_entry_does_not_evict_the_one_in_use() {
		let mut cache = cache_of(&[("video", MAX_ENTRY_BYTES)]);

		cache.put("photo", media(MAX_ENTRY_BYTES));

		assert!(
			cache.get("video").is_some(),
			"a video being played must survive one more full-size fetch"
		);
		assert!(cache.get("photo").is_some());
	}

	#[test]
	fn clearing_drops_every_entry_and_its_bytes() {
		let mut cache = cache_of(&[("a", 1024), ("b", LARGE_ENTRY_BYTES + 1)]);

		cache.clear();

		assert!(cache.get("a").is_none());
		assert!(cache.get("b").is_none());
		assert_eq!(cache.bytes, [0, 0]);
	}
}
