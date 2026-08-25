{
  description = "Open Grind — declarative build toolchain";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachSystem
      [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ]
      (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ (import rust-overlay) ];
            config = {
              android_sdk.accept_license = true;
              allowUnfree = true;
            };
          };
          inherit (pkgs) lib;

          common = import ./nix/common.nix { inherit pkgs lib; };

          targets = {
            android = import ./nix/android.nix {
              inherit
                pkgs
                lib
                nixpkgs
                common
                ;
            };
          }
          // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            linux = import ./nix/linux.nix { inherit pkgs lib common; };
          }
          // {
            windows-x64 = import ./nix/windows.nix {
              inherit pkgs lib common;
              arch = "x86_64";
            };
            windows-arm64 = import ./nix/windows.nix {
              inherit pkgs lib common;
              arch = "aarch64";
            };
          }
          // lib.optionalAttrs pkgs.stdenv.hostPlatform.isDarwin {
            macos = import ./nix/macos.nix { inherit pkgs lib common; };
          };

          renamed = f: lib.mapAttrs' (n: t: lib.nameValuePair "build-${n}" (f t)) targets;
        in
        {
          packages = renamed (t: t.package);

          apps = renamed (t: common.mkApp t.package);

          devShells = lib.mapAttrs (_: t: t.devShell) targets // {
            default = common.toolsShell;
            web = common.webShell;
          };

          formatter = pkgs.nixfmt-rfc-style;
        }
      );
}
