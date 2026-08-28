{
  pkgs,
  lib,
  common,
}:
let
  sdk = pkgs.apple-sdk;

  toolchainInputs =
    common.cargoInputs ++ common.frontendInputs ++ common.nativeCcInputs ++ [ pkgs.xcbuild ];

  env = {
    SDKROOT = toString sdk.sdkroot;
    DEVELOPER_DIR = toString sdk;
  };
in
{
  package = common.mkDesktopScript {
    name = "open-grind-build-macos";
    runtimeInputs = toolchainInputs;
    inherit env;
    text = ''
      for tool in hdiutil osascript codesign ditto xcrun; do
        command -v "$tool" >/dev/null \
          || { echo "FATAL: $tool not found — run xcode-select --install" >&2; exit 1; }
      done

      bun ci
      bun scripts/package-macos.ts "$@"
    '';
  };

  devShell = pkgs.mkShell (
    common.baseEnv
    // env
    // {
      packages = toolchainInputs ++ [ pkgs.shellcheck ];
      shellHook = ''
        echo "Open Grind dev shell: macOS desktop toolchain."
        echo "  Rust:      $(rustc --version)"
      '';
    }
  );
}
