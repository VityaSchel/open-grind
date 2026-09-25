#[cfg(target_os = "android")]
mod android;
#[cfg(test)]
mod pins;
mod pushes;
#[cfg(target_os = "android")]
mod session;

#[cfg(target_os = "android")]
pub use pushes::line_key;
#[cfg(target_os = "android")]
use pushes::{
	messages_path, pages_wanted, poll, Inbox, Pages, Poll, Push,
	ShownConversation, Watermarks,
};
