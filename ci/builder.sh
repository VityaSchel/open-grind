set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl git
. /etc/os-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

RUNNER_VERSION=12.13.0
RUNNER_SHA256=810468d3861a7aa885996c76d0bb58a8b8107eacc875b4cb1978a9654cc8dab7
install -d -m 0700 /etc/open-grind-ci
curl -fsSL -o /usr/local/bin/forgejo-runner \
	"https://code.forgejo.org/forgejo/runner/releases/download/v${RUNNER_VERSION}/forgejo-runner-${RUNNER_VERSION}-linux-amd64"
echo "$RUNNER_SHA256  /usr/local/bin/forgejo-runner" | sha256sum -c -
chmod +x /usr/local/bin/forgejo-runner

umask 077
printf '%s' "$RUNNER_TOKEN" > /etc/open-grind-ci/token
systemd-run --collect --unit=open-grind-runner \
	/usr/local/bin/forgejo-runner one-job --url "$FORGEJO_URL" --uuid "$RUNNER_UUID" \
	--token-url file:///etc/open-grind-ci/token --label "$RUNNER_LABEL:host" --wait
