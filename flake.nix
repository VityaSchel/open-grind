{
  description = "Open Grind — declarative Android build toolchain";

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

          # Single source of truth: src-tauri/gen/android/gradle.properties.
          # Parsed here so the flake never duplicates a constant Gradle
          # already needs to read.
          gradleProperties =
            let
              raw = builtins.readFile ./src-tauri/gen/android/gradle.properties;
              lines = pkgs.lib.splitString "\n" raw;
              isPair = l: !(pkgs.lib.hasPrefix "#" l) && (builtins.match ".+=.+" l != null);
              toPair =
                l:
                let
                  i = builtins.stringLength (builtins.head (pkgs.lib.splitString "=" l));
                in
                {
                  name = builtins.substring 0 i l;
                  value = builtins.substring (i + 1) (builtins.stringLength l) l;
                };
            in
            builtins.listToAttrs (map toPair (builtins.filter isPair lines));

          androidPlatformVersion = gradleProperties."opengrind.android.compileSdk";
          androidBuildToolsVersion = gradleProperties."opengrind.android.buildTools";
          androidNdkVersion = gradleProperties."opengrind.android.ndk";
          androidCmakeVersion = gradleProperties."opengrind.android.cmake";

          rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

          androidComposition = pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ androidPlatformVersion ];
            buildToolsVersions = [ androidBuildToolsVersion ];
            ndkVersions = [ androidNdkVersion ];
            cmakeVersions = [ androidCmakeVersion ];
            includeNDK = true;
            includeEmulator = false;
            includeSources = false;
            includeSystemImages = false;
            includeExtras = [ ];
          };

          androidSdk = androidComposition.androidsdk;
          androidSdkRoot = "${androidSdk}/libexec/android-sdk";
          ndkRoot = "${androidSdkRoot}/ndk/${androidNdkVersion}";
          buildToolsBin = "${androidSdkRoot}/build-tools/${androidBuildToolsVersion}";

          jdk = pkgs.jdk21_headless;

          # Tools needed at runtime by `tauri android build`.
          toolchainInputs = [
            rustToolchain
            pkgs.bun
            jdk
            pkgs.gradle_8
            androidSdk
            pkgs.pkg-config
            pkgs.stdenv.cc
            pkgs.libclang.lib
          ]
          ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
            pkgs.libiconv
          ];

          buildEnv = {
            JAVA_HOME = jdk.home;
            ANDROID_HOME = androidSdkRoot;
            ANDROID_SDK_ROOT = androidSdkRoot;
            ANDROID_NDK_HOME = ndkRoot;
            ANDROID_NDK_ROOT = ndkRoot;
            NDK_HOME = ndkRoot;
            GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdkRoot}/build-tools/${androidBuildToolsVersion}/aapt2";
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
          }
          // pkgs.lib.optionalAttrs pkgs.stdenv.isDarwin {
            LIBRARY_PATH = "${pkgs.libiconv}/lib";
          };

          envExports = pkgs.lib.concatStringsSep "\n" (
            pkgs.lib.mapAttrsToList (k: v: "export ${k}=${v}") buildEnv
          );

          buildAndroidScript = pkgs.writeShellApplication {
            name = "open-grind-build-android";
            runtimeInputs = toolchainInputs;
            text = ''
              set -euo pipefail

              ${envExports}
              export PATH="${buildToolsBin}:$PATH"

              # Project root: the directory containing this flake.
              ROOT="''${OPEN_GRIND_ROOT:-$PWD}"
              cd "$ROOT"

              # Optional pluggable keystore. Contributors point
              # OPEN_GRIND_KEYSTORE_PROPERTIES at a properties file
              # describing their JKS; we copy it into the gradle project
              # so the existing signingConfig picks it up.
              KEYSTORE_DEST="$ROOT/src-tauri/gen/android/keystore.properties"
              if [ -n "''${OPEN_GRIND_KEYSTORE_PROPERTIES:-}" ]; then
                cp "$OPEN_GRIND_KEYSTORE_PROPERTIES" "$KEYSTORE_DEST"
                trap 'rm -f "$KEYSTORE_DEST"' EXIT
              fi

              TARGET="''${1:-apk}"

              bun ci
              bun run tauri android build --"$TARGET"
            '';
          };
        in
        {
          devShells.default = pkgs.mkShell (
            buildEnv
            // {
              packages = toolchainInputs;
              shellHook = ''
                # Put apksigner, zipalign, aapt2 on PATH — androidenv
                # only exposes the SDK's top-level bin (adb, sdkmanager).
                export PATH="${buildToolsBin}:$PATH"

                echo "Open Grind dev shell: Android toolchain pinned via Nix."
                echo "  Rust:      $(rustc --version)"
                echo "  JDK:       $JAVA_HOME"
                echo "  SDK:       $ANDROID_HOME"
                echo "  NDK:       $NDK_HOME"
              '';
            }
          );

          packages = {
            default = buildAndroidScript;
            build-android = buildAndroidScript;
          };

          apps = {
            default = {
              type = "app";
              program = "${buildAndroidScript}/bin/open-grind-build-android";
            };
            build-android = {
              type = "app";
              program = "${buildAndroidScript}/bin/open-grind-build-android";
            };
          };

          formatter = pkgs.nixfmt-rfc-style;
        }
      );
}
