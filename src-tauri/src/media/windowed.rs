use std::collections::HashMap;
use std::time::{Duration, Instant};

const BAD_MOMENT: Duration = Duration::from_secs(300);

#[derive(Default)]
pub struct Windowed(HashMap<String, Option<Instant>>);

impl Windowed {
	pub fn contains(&mut self, key: &str) -> bool {
		match self.0.get(key) {
			None => false,
			Some(None) => true,
			Some(Some(marked)) if marked.elapsed() < BAD_MOMENT => true,
			Some(Some(_)) => {
				self.0.remove(key);
				false
			}
		}
	}

	pub fn always(&mut self, key: String) {
		self.0.insert(key, None);
	}

	pub fn for_now(&mut self, key: String) {
		if matches!(self.0.get(&key), Some(None)) {
			return;
		}
		self.0.retain(|_, marked| {
			marked.is_none_or(|at| at.elapsed() < BAD_MOMENT)
		});
		self.0.insert(key, Some(Instant::now()));
	}

	pub fn clear(&mut self) {
		self.0.clear();
	}

	#[cfg(test)]
	pub fn is_empty(&self) -> bool {
		self.0.is_empty()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn expired(windowed: &mut Windowed, key: &str) {
		let marked = Instant::now() - BAD_MOMENT - Duration::from_secs(1);
		windowed.0.insert(key.to_owned(), Some(marked));
	}

	#[test]
	fn a_body_over_the_ceiling_stays_windowed() {
		let mut windowed = Windowed::default();
		windowed.always("big".to_owned());

		assert!(windowed.contains("big"));
	}

	#[test]
	fn a_lost_deadline_stops_windowing_once_the_moment_has_passed() {
		let mut windowed = Windowed::default();
		windowed.for_now("slow".to_owned());
		assert!(windowed.contains("slow"));

		expired(&mut windowed, "slow");

		assert!(!windowed.contains("slow"));
		assert!(windowed.is_empty(), "an expired key is not kept around");
	}

	#[test]
	fn an_oversized_mark_outlives_a_later_timeout_on_the_same_key() {
		let mut windowed = Windowed::default();
		windowed.always("big".to_owned());

		windowed.for_now("big".to_owned());
		expired(&mut windowed, "other");

		assert!(windowed.contains("big"));
	}

	#[test]
	fn marking_prunes_the_keys_that_have_aged_out() {
		let mut windowed = Windowed::default();
		expired(&mut windowed, "stale");

		windowed.for_now("fresh".to_owned());

		assert!(!windowed.contains("stale"));
		assert!(windowed.contains("fresh"));
	}

	#[test]
	fn an_unmarked_key_is_never_windowed() {
		let mut windowed = Windowed::default();

		assert!(!windowed.contains("plain"));
	}

	#[test]
	fn clearing_forgets_every_mark_a_sign_out_must_drop() {
		let mut windowed = Windowed::default();
		windowed.always("big".to_owned());
		windowed.for_now("slow".to_owned());

		windowed.clear();

		assert!(windowed.is_empty());
	}
}
