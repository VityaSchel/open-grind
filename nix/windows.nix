{
  pkgs,
  lib,
  common,
  arch,
}:
let
  # nixpkgs marks nsis broken on darwin, where it builds and runs fine:
  # https://github.com/NixOS/nixpkgs/blob/da5ad661ba4e5ef59ba743f0d112cbc30e474f32/pkgs/by-name/ns/nsis/package.nix
  nsis = pkgs.nsis.overrideAttrs (previous: {
    meta = previous.meta // {
      broken = false;
    };
  });

  labels = {
    x86_64 = "x64";
    aarch64 = "arm64";
  };
  label = labels.${arch};
  triple = "${arch}-pc-windows-msvc";

  # NSIS stores each File source's mtime unless SetDateSave is off, and tauri's
  # template never turns it off while restaging every source on each build:
  # https://nsis.sourceforge.io/Docs/Chapter4.html#asetdatesave
  makensisPinned = pkgs.writeShellApplication {
    name = "makensis";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.findutils
      pkgs.gnugrep
    ];
    text = ''
      if [ -n "''${SOURCE_DATE_EPOCH:-}" ]; then
        for arg in "$@"; do
          case "$arg" in
            *.nsi)
              { grep -oE '"/[^"]+"' "$arg" || true; } | tr -d '"' | sort -u | while IFS= read -r source; do
                if [ -e "$source" ]; then
                  find "$source" -exec touch -h -d "@$SOURCE_DATE_EPOCH" {} +
                fi
              done
              ;;
          esac
        done
      fi
      # makensis aborts under LC_ALL=C on macOS; C.UTF-8 exists on both hosts.
      LC_ALL=C.UTF-8 exec ${nsis}/bin/makensis "$@"
    '';
  };

  toolchainInputs =
    common.cargoInputs
    ++ common.frontendInputs
    ++ common.nativeCcInputs
    ++ [
      pkgs.cargo-xwin
      makensisPinned
      nsis
      pkgs.llvmPackages.bintools-unwrapped # lld-link, llvm-lib, llvm-rc, on PATH for writeShellApplication too
      pkgs.llvmPackages.clang-unwrapped # clang-cl for cc-rs and cmake
      pkgs.nasm # BoringSSL needs NASM on Windows only
    ];

  env = {
    XWIN_ACCEPT_LICENSE = "1";
    NSIS_PATH = "${nsis}/share/nsis";
    # embed-resource classifies $RC by its banner; the bintools wrapper's
    # windres prints neither the GNU nor the LLVM one.
    RC = "llvm-rc";
  };
in
{
  package = common.mkDesktopScript {
    name = "open-grind-build-windows-${label}";
    runtimeInputs = toolchainInputs;
    inherit env;
    text = ''
      export XWIN_CACHE_DIR="''${XWIN_CACHE_DIR:-$HOME/.cache/cargo-xwin}"
      # No PDB: under /Brepro lld hashes the PDB into the CodeView GUID, and the
      # PDB records rustc's random response-file path.
      export RUSTFLAGS="''${RUSTFLAGS:-} -Clink-arg=/Brepro -Clink-arg=/DEBUG:NONE"
      # clang-cl ignores GCC-style flags; /clang: forwards them to the driver:
      # https://clang.llvm.org/docs/UsersManual.html#the-clang-option
      export CFLAGS="''${CFLAGS//-ffile-prefix-map=//clang:-ffile-prefix-map=}"
      export CXXFLAGS="''${CXXFLAGS//-ffile-prefix-map=//clang:-ffile-prefix-map=}"

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
