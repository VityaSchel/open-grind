{
  pkgs,
  common,
}:
{
  package = common.mkDesktopScript {
    name = "open-grind-build-ios";
    runtimeInputs =
      common.frontendInputs
      ++ common.nativeCcInputs
      ++ [
        (common.rustToolchain.override { extensions = [ "llvm-tools" ]; })
        pkgs.git
        pkgs.cctools
        pkgs.rcodesign
        pkgs.zip
      ];
    text = ''
      unset DEVELOPER_DIR SDKROOT RUSTFLAGS CARGO_ENCODED_RUSTFLAGS OPEN_GRIND_DEMO PUBLIC_TEST_INSETS \
        ZIP ZIPOPT "''${!RCODESIGN_@}"
      export CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS="--remap-path-prefix=$CARGO_HOME=/cargo --remap-path-prefix=$ROOT=/open-grind"
      ${common.freshCheckout}
      bun ci
      bun scripts/package-ios-sideload.ts "$@"
    '';
  };
}
