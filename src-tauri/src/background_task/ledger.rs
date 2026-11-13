pub type Task = usize;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
	MediaUpload,
	Deactivation,
}

impl Purpose {
	pub const ALL: [Self; 2] = [Self::MediaUpload, Self::Deactivation];

	pub const fn task_name(self) -> &'static str {
		match self {
			Self::MediaUpload => "Open Grind media upload",
			Self::Deactivation => "Open Grind going to the background",
		}
	}

	const fn slot(self) -> usize {
		match self {
			Self::MediaUpload => 0,
			Self::Deactivation => 1,
		}
	}
}

pub struct Slot {
	holders: usize,
	task: Option<Task>,
}

impl Slot {
	const fn new() -> Self {
		Self {
			holders: 0,
			task: None,
		}
	}

	pub fn hold(&mut self) {
		self.holders += 1;
	}

	pub fn release(&mut self) -> Option<Task> {
		self.holders = self.holders.saturating_sub(1);
		self.task_if_idle()
	}

	pub fn begun(&mut self, task: Task) {
		self.task = Some(task);
	}

	pub fn expired(&mut self, task: Task) -> Option<Task> {
		if self.task == Some(task) {
			self.task.take()
		} else {
			None
		}
	}

	fn task_if_idle(&mut self) -> Option<Task> {
		if self.holders == 0 {
			self.task.take()
		} else {
			None
		}
	}

	const fn unprotected(&self) -> bool {
		self.holders > 0 && self.task.is_none()
	}
}

pub struct Ledger {
	slots: [Slot; 2],
}

impl Ledger {
	pub const fn new() -> Self {
		Self {
			slots: [Slot::new(), Slot::new()],
		}
	}

	pub fn slot(&mut self, purpose: Purpose) -> &mut Slot {
		&mut self.slots[purpose.slot()]
	}

	pub fn backgrounded(&mut self) {
		self.slot(Purpose::Deactivation).holders = 1;
	}

	pub fn deactivated(&mut self) -> Option<Task> {
		let slot = self.slot(Purpose::Deactivation);
		slot.holders = 0;
		slot.task_if_idle()
	}

	pub fn unprotected(&self) -> Vec<Purpose> {
		Purpose::ALL
			.into_iter()
			.filter(|purpose| self.slots[purpose.slot()].unprotected())
			.collect()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn each_purpose_shows_up_under_its_own_task_name() {
		assert_eq!(Purpose::MediaUpload.task_name(), "Open Grind media upload");
		assert_ne!(
			Purpose::Deactivation.task_name(),
			Purpose::MediaUpload.task_name()
		);
	}

	#[test]
	fn concurrent_uploads_share_one_task_that_ends_with_the_last() {
		let mut ledger = Ledger::new();
		ledger.slot(Purpose::MediaUpload).hold();
		ledger.slot(Purpose::MediaUpload).hold();
		assert_eq!(ledger.unprotected(), [Purpose::MediaUpload]);
		ledger.slot(Purpose::MediaUpload).begun(7);
		assert!(ledger.unprotected().is_empty());

		assert_eq!(ledger.slot(Purpose::MediaUpload).release(), None);
		assert_eq!(ledger.slot(Purpose::MediaUpload).release(), Some(7));
		assert_eq!(ledger.slot(Purpose::MediaUpload).release(), None);
	}

	#[test]
	fn going_to_the_background_holds_one_task_until_the_app_deactivated() {
		let mut ledger = Ledger::new();
		ledger.backgrounded();
		assert_eq!(ledger.unprotected(), [Purpose::Deactivation]);
		ledger.slot(Purpose::Deactivation).begun(3);
		ledger.backgrounded();
		assert!(ledger.unprotected().is_empty());

		assert_eq!(ledger.deactivated(), Some(3));
		assert_eq!(ledger.deactivated(), None);
		assert!(ledger.unprotected().is_empty());
	}

	#[test]
	fn deactivating_leaves_a_running_upload_protected() {
		let mut ledger = Ledger::new();
		ledger.slot(Purpose::MediaUpload).hold();
		ledger.slot(Purpose::MediaUpload).begun(1);
		ledger.backgrounded();
		ledger.slot(Purpose::Deactivation).begun(2);

		assert_eq!(ledger.deactivated(), Some(2));
		assert_eq!(ledger.slot(Purpose::MediaUpload).release(), Some(1));
	}

	#[test]
	fn an_expired_upload_task_is_asked_for_again() {
		let mut ledger = Ledger::new();
		ledger.slot(Purpose::MediaUpload).hold();
		ledger.slot(Purpose::MediaUpload).begun(1);

		assert_eq!(ledger.slot(Purpose::MediaUpload).expired(9), None);
		assert_eq!(ledger.slot(Purpose::MediaUpload).expired(1), Some(1));
		assert_eq!(ledger.unprotected(), [Purpose::MediaUpload]);
	}
}
