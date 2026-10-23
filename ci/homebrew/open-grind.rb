cask "open-grind" do
  version "0.1.0-beta.5.1"
  sha256 "36b09bad2853e624e676e53539fb57ddc3a7619e3ec7901583f737ab31ad2e93"

  url "https://git.opengrind.org/open-grind/open-grind/releases/download/v#{version}/open-grind-v#{version}-macos.zip"
  name "Open Grind"
  desc "Unofficial FLOSS Grindr client"
  homepage "https://opengrind.org/"

  livecheck do
    url "https://git.opengrind.org/open-grind/open-grind.git"
    regex(/^v?(\d+(?:\.\d+)+(?:-[a-z]+(?:\.\d+)+)?)$/i)
    strategy :git
  end

  auto_updates true
  depends_on :macos

  app "Open Grind.app"

  zap trash: [
    "~/Library/Application Support/org.opengrind*",
    "~/Library/Caches/org.opengrind*",
    "~/Library/Preferences/org.opengrind*.plist",
    "~/Library/WebKit/org.opengrind*",
  ]
end
