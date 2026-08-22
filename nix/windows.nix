{
  pkgs,
  lib,
  common,
  arch,
}:
let
  labels = {
    x86_64 = "x64";
    aarch64 = "arm64";
  };
  label = labels.${arch};
  triple = "${arch}-pc-windows-msvc";

  toolchainInputs =
    common.cargoInputs
    ++ common.frontendInputs
    ++ common.nativeCcInputs
    ++ [
      pkgs.cargo-xwin
      pkgs.nsis
      pkgs.llvmPackages.bintools # lld-link, llvm-lib, llvm-rc
      pkgs.nasm # BoringSSL needs NASM on Windows only
    ];

  env = {
    XWIN_ACCEPT_LICENSE = "1";
    NSIS_PATH = "${pkgs.nsis}/share/nsis";
  };
in
{
  package = common.mkDesktopScript {
    name = "open-grind-build-windows-${label}";
    runtimeInputs = toolchainInputs;
    inherit env;
    text = ''
      echo "WARNING: unverified. Windows has never been compiled for this" >&2
      echo "project, and this is not a release path. boring-sys2 must build" >&2
      echo "BoringSSL under clang-cl, which no other target does." >&2
      echo >&2

      export XWIN_CACHE_DIR="''${XWIN_CACHE_DIR:-$HOME/.cache/cargo-xwin}"
      export RUSTFLAGS="''${RUSTFLAGS:-} -Clink-arg=/Brepro"

      bun ci
      bun run tauri build \
        --runner cargo-xwin \
        --target ${triple} \
        --bundles nsis
    '';
  };

  devShell = pkgs.mkShell (
    common.baseEnv
    // env
    // {
      packages = toolchainInputs ++ [ pkgs.shellcheck ];
      shellHook = ''
        echo "Open Grind dev shell: Windows ${label} cross toolchain (EXPERIMENTAL)."
        echo "  Rust:      $(rustc --version)"
        echo "  Target:    ${triple}"
      '';
    }
  );
}
