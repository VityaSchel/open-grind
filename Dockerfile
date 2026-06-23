# syntax=docker/dockerfile:1

# REQUIRES AN x86_64 HOST (native Linux, or an x86_64 Linux CI/VM). Does NOT
# work on Apple Silicon Docker Desktop: androidenv must build an i686-linux
# derivation (to patchelf the Android SDK's legacy 32-bit aapt/build-tools),
# which needs personality(PER_LINUX32); the arm64 VM kernel lacks 32-bit
# (aarch32) compat and returns EINVAL, so the toolchain can't be realized there
# under any emulation (QEMU or Rosetta).

FROM --platform=linux/amd64 nixos/nix:latest

RUN mkdir -p /etc/nix \
 && printf 'experimental-features = nix-command flakes\naccept-flake-config = true\nfilter-syscalls = false\n' \
      >> /etc/nix/nix.conf

RUN git config --system --add safe.directory /work

WORKDIR /work

CMD ["nix", "run", ".#build-android"]
