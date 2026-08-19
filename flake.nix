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
          // lib.optionalAttrs (system == "x86_64-linux") {
            windows = import ./nix/windows.nix { inherit pkgs lib common; };
          }
          // lib.optionalAttrs pkgs.stdenv.hostPlatform.isDarwin {
            macos = import ./nix/macos.nix { inherit pkgs lib common; };
          };

          renamed = f: lib.mapAttrs' (n: t: lib.nameValuePair "build-${n}" (f t)) targets;
        in
        {
          packages = renamed (t: t.package) // {
            default = targets.android.package;
          };

          apps = renamed (t: common.mkApp t.package) // {
            default = common.mkApp targets.android.package;
          };

          devShells = lib.mapAttrs (_: t: t.devShell) targets // {
            default = targets.android.devShell;
            web = common.webShell;
          };

          formatter = pkgs.nixfmt-rfc-style;
        }
      );
}
