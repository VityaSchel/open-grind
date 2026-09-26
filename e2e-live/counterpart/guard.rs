use std::fmt;

pub const APP_ACCOUNT: u64 = 858_049_792;
pub const COUNTERPART_ACCOUNT: u64 = 880_215_879;

const LIVE_ACCOUNTS: [u64; 2] = [APP_ACCOUNT, COUNTERPART_ACCOUNT];

#[derive(Debug, PartialEq, Eq)]
pub enum GuardError {
	NotALiveAccount(u64),
	SameAccountOnBothSides(u64),
}

impl fmt::Display for GuardError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::NotALiveAccount(id) => {
				write!(f, "{id} is not a live-test account")
			}
			Self::SameAccountOnBothSides(id) => {
				write!(f, "{id} cannot act on itself here")
			}
		}
	}
}

pub fn ensure_live_account(profile_id: u64) -> Result<u64, GuardError> {
	if LIVE_ACCOUNTS.contains(&profile_id) {
		Ok(profile_id)
	} else {
		Err(GuardError::NotALiveAccount(profile_id))
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LivePair {
	pub actor: u64,
	pub peer: u64,
}

impl LivePair {
	pub fn new(actor: u64, peer: u64) -> Result<Self, GuardError> {
		ensure_live_account(actor)?;
		ensure_live_account(peer)?;
		if actor == peer {
			return Err(GuardError::SameAccountOnBothSides(actor));
		}
		Ok(Self { actor, peer })
	}

	pub fn conversation_id(&self) -> String {
		let (low, high) = if self.actor < self.peer {
			(self.actor, self.peer)
		} else {
			(self.peer, self.actor)
		};
		format!("{low}:{high}")
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const OWNER_MAIN_ACCOUNT: u64 = 852_120_758;

	#[test]
	fn allows_the_two_burners_in_either_direction() {
		assert!(LivePair::new(COUNTERPART_ACCOUNT, APP_ACCOUNT).is_ok());
		assert!(LivePair::new(APP_ACCOUNT, COUNTERPART_ACCOUNT).is_ok());
	}

	#[test]
	fn refuses_the_owner_account_as_actor() {
		assert_eq!(
			LivePair::new(OWNER_MAIN_ACCOUNT, APP_ACCOUNT),
			Err(GuardError::NotALiveAccount(OWNER_MAIN_ACCOUNT))
		);
	}

	#[test]
	fn refuses_the_owner_account_as_peer() {
		assert_eq!(
			LivePair::new(COUNTERPART_ACCOUNT, OWNER_MAIN_ACCOUNT),
			Err(GuardError::NotALiveAccount(OWNER_MAIN_ACCOUNT))
		);
	}

	#[test]
	fn refuses_any_unknown_account() {
		assert_eq!(ensure_live_account(1), Err(GuardError::NotALiveAccount(1)));
	}

	#[test]
	fn refuses_an_account_acting_on_itself() {
		assert_eq!(
			LivePair::new(APP_ACCOUNT, APP_ACCOUNT),
			Err(GuardError::SameAccountOnBothSides(APP_ACCOUNT))
		);
	}

	#[test]
	fn conversation_id_puts_the_lower_id_first() {
		let pair = LivePair::new(COUNTERPART_ACCOUNT, APP_ACCOUNT).unwrap();
		assert_eq!(pair.conversation_id(), "858049792:880215879");
	}
}
