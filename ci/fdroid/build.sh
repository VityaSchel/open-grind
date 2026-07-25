set -euo pipefail
source /etc/profile.d/bsenv.sh
fdroidserver="${fdroidserver:-/opt/fdroidserver}"
command -v fdroid >/dev/null || [ -x "$fdroidserver/fdroid" ] \
	|| git clone --depth 1 https://gitlab.com/fdroid/fdroidserver.git "$fdroidserver"
chown -R vagrant /repo "$fdroidserver"
cd /repo
for d in logs tmp unsigned "$home_vagrant/.android" "$home_vagrant/.gradle"; do
	mkdir -p "$d"; chown -R vagrant "$d"
done
export GRADLE_USER_HOME="$home_vagrant/.gradle"
sudo --preserve-env --user vagrant \
	env PATH="$fdroidserver:$PATH" PYTHONPATH="$fdroidserver:$fdroidserver/examples" \
	PYTHONUNBUFFERED=true HOME="$home_vagrant" GRADLE_USER_HOME="$GRADLE_USER_HOME" \
	fdroid build --verbose --test --refresh-scanner --on-server --no-tarball ${APPID}:${versionCode}
