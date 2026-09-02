use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{Mutex, OwnedMutexGuard};

#[derive(Default)]
pub struct Flights(Mutex<HashMap<String, Arc<Mutex<()>>>>);

impl Flights {
	pub async fn acquire(&self, key: &str) -> OwnedMutexGuard<()> {
		let lock = {
			let mut flights = self.0.lock().await;
			flights.retain(|_, lock| Arc::strong_count(lock) > 1);
			Arc::clone(flights.entry(key.to_owned()).or_default())
		};
		lock.lock_owned().await
	}

	pub async fn clear(&self) {
		self.0.lock().await.clear();
	}

	#[cfg(test)]
	pub async fn is_empty(&self) -> bool {
		self.0.lock().await.is_empty()
	}
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use super::*;

	#[tokio::test]
	async fn a_key_admits_one_flight_at_a_time() {
		let flights = Arc::new(Flights::default());
		let held = flights.acquire("k").await;

		let contender = tokio::spawn({
			let flights = Arc::clone(&flights);
			async move { flights.acquire("k").await }
		});
		tokio::task::yield_now().await;
		assert!(!contender.is_finished());

		drop(held);
		tokio::time::timeout(Duration::from_secs(5), contender)
			.await
			.expect("the next flight starts once the first lands")
			.unwrap();
	}

	#[tokio::test]
	async fn different_keys_fly_concurrently() {
		let flights = Flights::default();
		let _held = flights.acquire("a").await;

		tokio::time::timeout(Duration::from_secs(5), flights.acquire("b"))
			.await
			.expect("an unrelated key must not wait");
	}

	#[tokio::test]
	async fn clearing_drops_every_key_a_sign_out_must_forget() {
		let flights = Flights::default();
		drop(flights.acquire("a").await);
		let _held = flights.acquire("b").await;

		flights.clear().await;

		assert!(flights.is_empty().await);
	}

	#[tokio::test]
	async fn landed_flights_are_pruned_on_the_next_acquire() {
		let flights = Flights::default();
		drop(flights.acquire("a").await);

		let _held = flights.acquire("b").await;

		let map = flights.0.lock().await;
		assert_eq!(map.len(), 1);
		assert!(map.contains_key("b"));
	}
}
