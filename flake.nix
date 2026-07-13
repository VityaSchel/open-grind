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

          # Parsed from gradle.properties so versions live in exactly one place.
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

          # Strip androidenv's 32-bit i686 deps (x86_64-linux only): realizing an
          # i686 drv calls personality(PER_LINUX32), which the arm64 kernel of
          # Docker Desktop's VM (Apple Silicon) rejects. Unused by APK builds.
          androidenv =
            if pkgs.stdenv.hostPlatform.system == "x86_64-linux" then
              import
                (pkgs.applyPatches {
                  name = "androidenv-no-i686";
                  src = "${nixpkgs}/pkgs/development/mobile/androidenv";
                  postPatch = ''
                    substituteInPlace build-tools.nix \
                      --replace-fail 'os == "linux" && stdenv.hostPlatform.isx86_64' 'false'
                    substituteInPlace build-tools.nix \
                      --replace-fail 'noAuditTmpdir = true;' \
                        'autoPatchelfIgnoreMissingDeps = [ "*" ]; noAuditTmpdir = true;'
                  '';
                })
                { inherit (pkgs) lib; pkgs = pkgs; }
            else
              pkgs.androidenv;

          androidComposition = androidenv.composeAndroidPackages {
            platformVersions = [ androidPlatformVersion ];
            buildToolsVersions = [ androidBuildToolsVersion ];
            ndkVersions = [ androidNdkVersion ];
            cmakeVersions = [ androidCmakeVersion ];
            includeNDK = true;
            includeEmulator = false;
            includeSources = false;
            includeSystemImages = false;
            includeExtras = [ ];
            toolsVersion = null; # deprecated, unused, and another i686 source
          };

          androidSdk = androidComposition.androidsdk;
          androidSdkRoot = "${androidSdk}/libexec/android-sdk";
          ndkRoot = "${androidSdkRoot}/ndk/${androidNdkVersion}";
          buildToolsBin = "${androidSdkRoot}/build-tools/${androidBuildToolsVersion}";
          cmakeBin = "${androidSdkRoot}/cmake/${androidCmakeVersion}/bin";

          jdk = pkgs.jdk21_headless;

          toolchainInputs = [
            rustToolchain
            pkgs.bun
            jdk
            pkgs.gradle_8
            androidSdk
            pkgs.pkg-config
            pkgs.stdenv.cc
            pkgs.libclang.lib
            pkgs.gnused # gradlew's arg-parsing needs sed
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
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
            CMAKE_GENERATOR = "Ninja";
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
              export PATH="${buildToolsBin}:${cmakeBin}:$PATH"

              ROOT="''${OPEN_GRIND_ROOT:-$PWD}"
              cd "$ROOT"

              KEYSTORE_DEST="$ROOT/src-tauri/gen/android/keystore.properties"

              # Point AGP at the SDK's patchelf'd aapt2. Inject the machine-specific
              # /nix/store path through a dedicated Gradle user home rather than the
              # tracked gradle.properties: an EXIT trap is not crash-safe, and a leftover
              # store path must never reach git (it is wrong for every other machine). A
              # GRADLE_USER_HOME gradle.properties overrides the project one and accepts
              # the dotted key that -D/ORG_GRADLE_PROJECT_ env vars cannot express
              # (-D also does not reach the Gradle daemon, nixpkgs#402297). Docker caches
              # this dir via the open-grind-gradle volume (see docker-compose.yml).
              export GRADLE_USER_HOME="''${OPEN_GRIND_GRADLE_USER_HOME:-$HOME/.gradle-opengrind}"
              mkdir -p "$GRADLE_USER_HOME"
              printf 'android.aapt2FromMavenOverride=%s/aapt2\n' "${buildToolsBin}" > "$GRADLE_USER_HOME/gradle.properties"

              # OPEN_GRIND_KEYSTORE_PROPERTIES -> keystore.properties for signingConfig.
              # keystore.properties is gitignored; remove it on exit so the secret does
              # not linger in the working tree.
              if [ -n "''${OPEN_GRIND_KEYSTORE_PROPERTIES:-}" ]; then
                cp "$OPEN_GRIND_KEYSTORE_PROPERTIES" "$KEYSTORE_DEST"
                trap 'rm -f "$KEYSTORE_DEST"' EXIT
              fi

              TARGET="''${1:-apk}"

              bun ci
              # OPEN_GRIND_ANDROID_ABI=aarch64 builds one ABI instead of universal.
              if [ -n "''${OPEN_GRIND_ANDROID_ABI:-}" ]; then
                bun run tauri android build --"$TARGET" --target "''${OPEN_GRIND_ANDROID_ABI}"
              else
                bun run tauri android build --"$TARGET"
              fi

              if [ -n "''${OPEN_GRIND_KEYSTORE_PROPERTIES:-}" ]; then sfx=""; else sfx="-unsigned"; fi
              base="$ROOT/src-tauri/gen/android/app/build/outputs"

              echo
              if [ "$TARGET" = "aab" ]; then
                echo "Produced app bundle(s) under: $base/bundle/"
              else
                apk="$base/apk/universal/release/app-universal-release$sfx.apk"
                if [ -f "$apk" ]; then
                  printf 'Produced: %s (%s)\n' "$apk" "$(du -h "$apk" | cut -f1)"
                else
                  printf 'Produced: %s\n' "$apk"
                fi
              fi
            '';
          };
        in
        {
          devShells.default = pkgs.mkShell (
            buildEnv
            // {
              packages = toolchainInputs;
              shellHook = ''
                # androidenv exposes only adb/sdkmanager; add build-tools + cmake.
                export PATH="${buildToolsBin}:${cmakeBin}:$PATH"

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
