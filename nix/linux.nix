{
  pkgs,
  lib,
  common,
}:
let
  gtkStack = with pkgs; [
    webkitgtk_4_1
    gtk3
    libsoup_3
    glib
    cairo
    pango
    gdk-pixbuf
    atk
    at-spi2-atk
    at-spi2-core
    libayatana-appindicator
    librsvg
    xorg.libX11
  ];

  pkgConfigPath = lib.concatStringsSep ":" (
    map (p: "${lib.getDev p}/lib/pkgconfig") gtkStack
    ++ map (p: "${lib.getDev p}/share/pkgconfig") gtkStack
  );

  schemas = pkgs.gsettings-desktop-schemas;

  toolchainInputs =
    common.cargoInputs
    ++ common.frontendInputs
    ++ common.nativeCcInputs
    ++ [
      pkgs.clang
      pkgs.desktop-file-utils
      pkgs.file
      pkgs.glib # glib-compile-schemas
      pkgs.binutils # `strings`, and objdump for the glibc floor check
    ];

  env = {
    PKG_CONFIG_PATH = pkgConfigPath;
    XDG_DATA_DIRS = "${schemas}/share/gsettings-schemas/${schemas.name}:${pkgs.gtk3}/share";
  };

  triple = pkgs.stdenv.hostPlatform.rust.rustcTarget;
in
{
  package = common.mkDesktopScript {
    name = "open-grind-build-linux";
    runtimeInputs = toolchainInputs;
    inherit env;
    text = ''
      # appimage at default settings over-bundles and dies on Mesa 25+ distros:
      # https://github.com/tauri-apps/tauri/issues/15665
      BUNDLES="''${OPEN_GRIND_LINUX_BUNDLES:-deb}"

      bun ci
      bun run tauri build --target ${triple} --bundles "$BUNDLES"

      out="$ROOT/src-tauri/target/${triple}/release"
      echo
      echo "glibc floor: $(objdump -T "$out/open-grind" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)"
      find "$out/bundle" -maxdepth 2 -type f \( -name '*.deb' -o -name '*.rpm' \) -print
    '';
  };

  devShell = pkgs.mkShell (
    common.baseEnv
    // {
      packages = toolchainInputs ++ [ pkgs.shellcheck ];
      buildInputs = gtkStack; # mkShell wires PKG_CONFIG_PATH and NIX_LDFLAGS
      shellHook = ''
        echo "Open Grind dev shell: Linux desktop toolchain."
        echo "  Rust:      $(rustc --version)"
        echo "  WebKitGTK: ${pkgs.webkitgtk_4_1.version}"
      '';
    }
  );
}
