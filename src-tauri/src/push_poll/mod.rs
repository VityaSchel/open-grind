#[cfg(target_os = "android")]
mod android;
#[cfg(test)]
mod pins;
mod pushes;
#[cfg(target_os = "android")]
mod session;

#[cfg(target_os = "android")]
use pushes::{poll, Inbox, Poll, Watermarks};
