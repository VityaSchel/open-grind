{
  pkgs,
  lib,
  common,
}:
let
  toolchainInputs =
    common.cargoInputs ++ common.frontendInputs ++ common.nativeCcInputs ++ [ pkgs.xcbuild ];
in
{
  package = common.mkDesktopScript {
    name = "open-grind-build-macos";
    runtimeInputs = toolchainInputs;
    text = ''
      for tool in hdiutil osascript codesign xcrun; do
        command -v "$tool" >/dev/null \
          || { echo "FATAL: $tool not found — run xcode-select --install" >&2; exit 1; }
      done

      bun ci
      bun run tauri build --features keychain --bundles app
    '';
  };

  devShell = pkgs.mkShell (
    common.baseEnv
    // {
      packages = toolchainInputs ++ [ pkgs.shellcheck ];
      shellHook = ''
        echo "Open Grind dev shell: macOS desktop toolchain."
        echo "  Rust:      $(rustc --version)"
      '';
    }
  );
}
