# shellcheck shell=bash
# shellcheck disable=SC1091,SC2154  # F-Droid's buildserver provides bsenv.sh and these variables
set -euo pipefail
source /etc/profile.d/bsenv.sh
fdroidserver="${fdroidserver:-/opt/fdroidserver}"
command -v fdroid >/dev/null || [ -x "$fdroidserver/fdroid" ] \
	|| git clone --depth 1 https://gitlab.com/fdroid/fdroidserver.git "$fdroidserver"
cd /repo
mkdir -p build
git clone --quiet "${repoUrl}" "build/${APPID}"
git -C "build/${APPID}" checkout --quiet --detach "${commit}"
printf 'git %s' "${repoUrl}" > "build/.fdroidvcs-${APPID}"
chown -R vagrant /repo "$fdroidserver"
for d in logs tmp unsigned "$home_vagrant/.android" "$home_vagrant/.gradle"; do
	mkdir -p "$d"; chown -R vagrant "$d"
done
export GRADLE_USER_HOME="$home_vagrant/.gradle"
sudo --preserve-env --user vagrant \
	env PATH="$fdroidserver:$PATH" PYTHONPATH="$fdroidserver:$fdroidserver/examples" \
	PYTHONUNBUFFERED=true HOME="$home_vagrant" GRADLE_USER_HOME="$GRADLE_USER_HOME" \
	fdroid build --verbose --test --refresh-scanner --scan-binary --on-server --no-tarball "${APPID}:${versionCode}"
