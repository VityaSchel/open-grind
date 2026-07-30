# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 nixos/nix:2.35.1@sha256:377d4887aca98f0dfa12971c1ea6d6a625a435d8b610d4c95a436843da6fbfd1

RUN mkdir -p /etc/nix \
 && printf 'experimental-features = nix-command flakes\naccept-flake-config = true\nfilter-syscalls = false\n' \
      >> /etc/nix/nix.conf

RUN git config --system --add safe.directory /work

WORKDIR /work

CMD ["nix", "run", ".#build-android"]
