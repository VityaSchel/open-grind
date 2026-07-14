# Release CI

Rented cloud VMs on independent providers build the same ref independently. The run publishes an unsigned APK only if every build is byte-for-byte identical. This splits trust to build machine among multiple entities and ensures builds reproducibility. Signing happens locally only (`ci/sign.sh` with `OPEN_GRIND_KEYSTORE_PROPERTIES`), the key never touches CI.

## Layout

- `ci/config.env` — every human-editable value, active boxes, plans, regions
- `ci/provision.sh`, `ci/verify.sh`, `ci/teardown.sh`, `ci/sweep.sh`, `ci/lib.sh` — one script per orchestrator job plus, helpers
- `ci/builder.sh` — cloud-init payload: a builder installs Docker and runs one ephemeral runner job
- `ci/terraform/boxes/<letter>/` — one self-contained Terraform root module per provider
- `ci/orchestrator/` — orchestrator image: pinned Terraform, offline provider mirror
- `ci/sign.sh` — local signing of a verified unsigned APK
- `.forgejo/workflows/build.yml` — the release workflow
- `.forgejo/workflows/sweep.yml` — hourly leak sweeper

## Boxes

Each provider owns a fixed box letter. The active set is `OPEN_GRIND_BOXES` in [config.env](config.env) and must equal the matrix in build.yml. All plans are x86_64.

## Workflow

`build.yml` is triggered from the [Actions tab](https://git.opengrind.org/open-grind/open-grind/actions) by maintainers.

| Job          | Runs on      | Does                                                                                                                      |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| provision    | orchestrator | checks matrix/config agreement, registers one ephemeral runner per active box, applies each box's Terraform module (2-5m) |
| build (a..c) | the builders | builds the ref with the repo's pinned Docker/Nix toolchain (32-35m)                                                       |
| verify       | orchestrator | compares the APKs, publishes `open-grind-unsigned` on byte-identity (10s)                                                 |
| teardown     | orchestrator | deletes runner records and all billed resources of active boxes, retries and fails red if anything survives (1m)          |
|              |              |                                                                                                                           |

`sweep.yml` runs teardown hourly as a fallback, e.g. when cancelling a run via the Forgejo UI.

## Setup

### Orchestrator

Orchestrator (`open-grind-orchestrator`) spawns build boxes. It runs on the git.opengrind.org Forgejo host. Jobs run in a throwaway container with no host volumes, no docker socket, and no privileged mode.

[Forgejo Runner](https://code.forgejo.org/forgejo/runner/releases) must be installed — the same release the builders use, pinned as `RUNNER_VERSION`/`RUNNER_SHA256` in [builder.sh](builder.sh).

```sh
sudo useradd --system --create-home --home-dir /var/lib/open-grind-runner \
	--shell /usr/sbin/nologin open-grind-runner
sudo usermod -aG docker open-grind-runner
sudo cp ci/orchestrator-runner.config.yaml /var/lib/open-grind-runner/config.yaml
```

The job image is a digest-pinned `open-grind-orchestrator` image hosted in the Docker registry at https://git.opengrind.org/open-grind/-/packages. To build it:

```sh
docker login git.opengrind.org

docker buildx build --push --provenance=false --sbom=false --platform linux/amd64 \
	-t git.opengrind.org/open-grind/open-grind-orchestrator:linux-amd64-v1 \
	-f ci/orchestrator/Dockerfile ci
docker inspect --format='{{index .RepoDigests 0}}' git.opengrind.org/open-grind/open-grind-orchestrator:linux-amd64-v1
```

Then update its sha256 hash in orchestrator-runner.config.yaml and redeploy forgejo-open-grind-runner.service.

`/usr/local/lib/systemd/system/forgejo-open-grind-runner.service`:

```ini
[Unit]
Description=open-grind orchestrator runner
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
User=open-grind-runner
WorkingDirectory=/var/lib/open-grind-runner
ExecStart=/usr/local/bin/forgejo-runner --config /var/lib/open-grind-runner/config.yaml daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

`main` branch is protected.

### Secrets

Build box runners are ephemeral and registered on the fly by the orchestrator. Only active boxes need their secrets set.

| Box | Secret                                | Value                                 |
| --- | ------------------------------------- | ------------------------------------- |
| all | `OPEN_GRIND_FORGEJO_TOKEN`            | token able to register repo runners   |
| a   | `OPEN_GRIND_CHERRY_API_TOKEN`         | Cherry Servers API key                |
| a   | `OPEN_GRIND_CHERRY_PROJECT_ID`        | Cherry Servers project id             |
| a   | `OPEN_GRIND_CHERRY_SSH_KEY_IDS`       | JSON array, e.g. `["1234"]`           |
| b   | `OPEN_GRIND_VULTR_API_KEY`            | Vultr API key                         |
| b   | `OPEN_GRIND_VULTR_SSH_KEY_IDS`        | JSON array of key UUIDs               |
| c   | `OPEN_GRIND_HETZNER_API_TOKEN`        | Hetzner Cloud API token, read+write   |
| c   | `OPEN_GRIND_HETZNER_SSH_KEY_IDS`      | JSON array of key IDs or names        |
| d   | `OPEN_GRIND_SCALEWAY_ACCESS_KEY`      | Scaleway IAM API key id               |
| d   | `OPEN_GRIND_SCALEWAY_SECRET_KEY`      | Scaleway IAM API key secret           |
| d   | `OPEN_GRIND_SCALEWAY_PROJECT_ID`      | Scaleway project id                   |
| e   | `OPEN_GRIND_DIGITALOCEAN_TOKEN`       | DigitalOcean API token, read+write    |
| e   | `OPEN_GRIND_DIGITALOCEAN_SSH_KEY_IDS` | JSON array of key IDs or fingerprints |
|     |                                       |                                       |

Credentials are prefixed with `OPEN_GRIND_*` because provider SDKs sometimes override Terraform blocks.

## Notes

- Any value in config.env can be overridden per run by a Forgejo Actions variable of the same name
- Teardown and the sweeper only kill active boxes. Manual cleanup: `OPEN_GRIND_BOXES="d" bash ci/teardown.sh`
- Run artifacts currently download as zip because Forgejo's fork of upload-artifact (v4) has no unzipped mode, and GitHub's v7 (`archive: false`) refuses any non-github.com host
