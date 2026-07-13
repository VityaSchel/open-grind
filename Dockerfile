# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 nixos/nix:latest

RUN mkdir -p /etc/nix \
 && printf 'experimental-features = nix-command flakes\naccept-flake-config = true\nfilter-syscalls = false\n' \
      >> /etc/nix/nix.conf

RUN git config --system --add safe.directory /work

WORKDIR /work

CMD ["nix", "run", ".#build-android"]
