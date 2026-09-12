---
prev: false
next: false
title: 'Install video codecs on Linux'
titleTemplate: ':title — Open Grind'
---

# Install video codecs on Linux

Album and chat videos are H.264. Most distributions do not install an H.264 decoder by default.

Run the commands for your distribution, then quit Open Grind completely and open it again.

## Debian, Ubuntu, Linux Mint, Pop!\_OS

```sh
sudo apt update
sudo apt install gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-tools
```

## Fedora

```sh
sudo dnf install openh264 gstreamer1-plugin-openh264
rpm -qf /usr/lib64/libopenh264.so.8
```

The second command must print `openh264-…`. If it prints `noopenh264-…`, or the install said `No match for argument`:

```sh
sudo dnf config-manager setopt fedora-cisco-openh264.enabled=1
sudo dnf install openh264
```

If videos still fail:

```sh
sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install libavcodec-freeworld
rm -f ~/.cache/gstreamer-1.0/registry.*.bin
```

## Fedora Silverblue, Kinoite, Bazzite

Each step takes effect only after its reboot.

```sh
sudo rpm-ostree install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo systemctl reboot
```

```sh
sudo rpm-ostree install --allow-inactive gstreamer1-plugin-libav libavcodec-freeworld
sudo systemctl reboot
```

```sh
rm -f ~/.cache/gstreamer-1.0/registry.*.bin
```

After a Fedora release upgrade:

```sh
sudo rpm-ostree update --uninstall rpmfusion-free-release --install rpmfusion-free-release
```

## Arch Linux, Manjaro, EndeavourOS

```sh
sudo pacman -Syu --needed gst-libav gst-plugins-good
```

## openSUSE Tumbleweed, Leap

```sh
sudo zypper install --from repo-openh264 libopenh264-8
rpm -q libopenh264-8
```

The printed version must not contain `noopenh264`. If zypper reports no `repo-openh264`:

```sh
sudo zypper addrepo -f https://codecs.opensuse.org/openh264/openSUSE_Tumbleweed/ repo-openh264
sudo zypper --gpg-auto-import-keys refresh
```

On Leap 16, put `openSUSE_Leap_16` in that URL.

## NixOS

Add to `/etc/nixos/configuration.nix`:

```nix
{ lib, pkgs, ... }:
let
  gstPlugins = with pkgs.gst_all_1; [
    gstreamer
    gst-plugins-base
    gst-plugins-good
    gst-plugins-bad
    gst-libav
  ];
in
{
  environment.systemPackages = gstPlugins;
  environment.sessionVariables.GST_PLUGIN_SYSTEM_PATH_1_0 =
    lib.makeSearchPathOutput "out" "lib/gstreamer-1.0" gstPlugins;
}
```

```sh
sudo nixos-rebuild switch
```

Then log out and back in.

## Alpine Linux

```sh
doas setup-apkrepos -o
doas apk add gstreamer-tools gst-plugins-base gst-plugins-good gst-libav
```

## Void Linux

```sh
sudo xbps-install -Su
sudo xbps-install -S gst-libav gst-plugins-good1
```

## Gentoo

```sh
sudo emerge --ask media-libs/gst-plugins-good media-plugins/gst-plugins-libav
```

## Check it worked

```sh
gst-inspect-1.0 avdec_h264
```

Plugin details mean the decoder is installed. `No such element or plugin` means it is not. On Fedora and openSUSE, use the `rpm` check from those sections.

## Still not working

1. Quit Open Grind completely and open it again.
2. Clear the codec cache:
   ```sh
   rm -rf ~/.cache/gstreamer-1.0
   ```
3. Check the MP4 container reader:
   ```sh
   gst-inspect-1.0 qtdemux
   ```
4. [Open an issue](https://git.opengrind.org/open-grind/open-grind/issues) with your distribution, its version, and the output of the check above.
