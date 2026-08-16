{ pkgs, lib }:
rec {
  rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ../rust-toolchain.toml;

  frontendInputs = [
    pkgs.bun
    pkgs.nodejs_24
  ];

  cargoInputs = [
    rustToolchain
    pkgs.pkg-config
    pkgs.stdenv.cc
    pkgs.libclang.lib
    pkgs.git # boring-sys2 patches BoringSSL with `git apply` on every build
  ]
  ++ lib.optionals pkgs.stdenv.isDarwin [ pkgs.libiconv ];

  nativeCcInputs = with pkgs; [
    cmake
    ninja
    perl
    go
  ];

  baseEnv = {
    LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
    CMAKE_GENERATOR = "Ninja";
  }
  // lib.optionalAttrs pkgs.stdenv.isDarwin {
    LIBRARY_PATH = "${pkgs.libiconv}/lib";
  };

  exportEnv = env: lib.concatStringsSep "\n" (lib.mapAttrsToList (k: v: "export ${k}=${v}") env);

  reproPreamble = ''
    ROOT="''${OPEN_GRIND_ROOT:-$PWD}"
    cd "$ROOT"
    # rustc and clang see the symlink-resolved path, which is what must match.
    ROOT="$(pwd -P)"

    # F-Droid's buildserver fixes its checkout and HOME at /repo/build/<appid>
    # and /home/vagrant, so ours can never match; remap both sides to literals
    # instead. Lives here, not in build.yml, which F-Droid never reads.
    CARGO_HOME="''${CARGO_HOME:-$HOME/.cargo}"
    export CARGO_HOME
    export RUSTFLAGS="''${RUSTFLAGS:-} --remap-path-prefix=$CARGO_HOME=/cargo --remap-path-prefix=$ROOT=/open-grind"
    # rustc's remap misses C: BoringSSL bakes __FILE__ from boring-sys2's
    # OUT_DIR. cc forwards these into the cmake crate's CMAKE_C_FLAGS, and
    # neither var feeds cargo's unit hash, so boring-sys2-<hash> stays stable.
    prefixMaps="-ffile-prefix-map=$CARGO_HOME=/cargo -ffile-prefix-map=$ROOT=/open-grind"
    export CFLAGS="''${CFLAGS:-} $prefixMaps"
    export CXXFLAGS="''${CXXFLAGS:-} $prefixMaps"
  '';

  # Hoisting these into reproPreamble would change an Android build that three
  # providers currently byte-match; do it only behind a fresh 3-box comparison.
  desktopRepro = ''
    export TZ=UTC
    export LC_ALL=C
    export LANG=C
    SOURCE_DATE_EPOCH="''${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" log -1 --pretty=%ct)}"
    export SOURCE_DATE_EPOCH
    export NODE_OPTIONS="''${NODE_OPTIONS:---max-old-space-size=4096}"
  '';

  mkDesktopScript =
    {
      name,
      runtimeInputs,
      env ? { },
      text,
    }:
    pkgs.writeShellApplication {
      inherit name runtimeInputs;
      meta.mainProgram = name;
      text = ''
        ${exportEnv (baseEnv // env)}
        ${reproPreamble}
        ${desktopRepro}
        ${text}
      '';
    };

  mkApp = package: {
    type = "app";
    program = lib.getExe package;
  };

  webShell = pkgs.mkShell {
    packages = frontendInputs ++ [
      pkgs.git
      pkgs.shellcheck
    ];
    shellHook = ''
      echo "Open Grind: frontend-only shell (bun $(bun --version), node $(node --version))"
    '';
  };
}
