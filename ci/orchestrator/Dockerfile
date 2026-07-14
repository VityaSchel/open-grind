FROM --platform=$BUILDPLATFORM golang:1.26-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build
RUN apk add --no-cache git
ARG TARGETOS TARGETARCH
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-trimpath GOOS=$TARGETOS GOARCH=$TARGETARCH

ARG TERRAFORM_VERSION=1.15.8
ARG TERRAFORM_COMMIT=b9e178decf87d274d25ed36bc5a4dbc857e00420
ARG CHERRY_VERSION=1.5.3
ARG CHERRY_COMMIT=503d4434a6a2dbf56e7e0002aec5e54ae1db9e10
ARG VULTR_VERSION=2.31.2
ARG VULTR_COMMIT=88f0cba3cb39e9c8ef6dbb18ff23dfc6326fc81d
ARG HCLOUD_VERSION=1.66.0
ARG HCLOUD_COMMIT=f95ed41dcbfcf09f30609bdfe8aa587ba4e067e0
ARG SCALEWAY_VERSION=2.78.0
ARG SCALEWAY_COMMIT=8d1187118bf78cf728f8296ac63134e648e8ab68
ARG DIGITALOCEAN_VERSION=2.95.0
ARG DIGITALOCEAN_COMMIT=6bf2a8c136d894695712ba51d0831c9b524c2986
ARG XNET_VERSION=v0.55.0

RUN git init -q /src/terraform && cd /src/terraform \
	&& git remote add origin https://github.com/hashicorp/terraform \
	&& git fetch -q --depth 1 origin "refs/tags/v$TERRAFORM_VERSION:refs/tags/v$TERRAFORM_VERSION" \
	&& test "$(git rev-parse "v$TERRAFORM_VERSION^{commit}")" = "$TERRAFORM_COMMIT" \
	&& git checkout -q "v$TERRAFORM_VERSION" \
	&& go build -ldflags "-X github.com/hashicorp/terraform/version.dev=no" -o /out/bin/terraform .

RUN git init -q /src/cherry && cd /src/cherry \
	&& git remote add origin https://github.com/cherryservers/terraform-provider-cherryservers \
	&& git fetch -q --depth 1 origin "refs/tags/v$CHERRY_VERSION:refs/tags/v$CHERRY_VERSION" \
	&& test "$(git rev-parse "v$CHERRY_VERSION^{commit}")" = "$CHERRY_COMMIT" \
	&& git checkout -q "v$CHERRY_VERSION" \
	&& go get golang.org/x/net@"$XNET_VERSION" && go mod tidy \
	&& go build -o "/out/providers/registry.terraform.io/cherryservers/cherryservers/$CHERRY_VERSION/$(go env GOOS)_$(go env GOARCH)/terraform-provider-cherryservers_v$CHERRY_VERSION" .

RUN git init -q /src/vultr && cd /src/vultr \
	&& git remote add origin https://github.com/vultr/terraform-provider-vultr \
	&& git fetch -q --depth 1 origin "refs/tags/v$VULTR_VERSION:refs/tags/v$VULTR_VERSION" \
	&& test "$(git rev-parse "v$VULTR_VERSION^{commit}")" = "$VULTR_COMMIT" \
	&& git checkout -q "v$VULTR_VERSION" \
	&& go get golang.org/x/net@"$XNET_VERSION" && go mod tidy \
	&& go build -o "/out/providers/registry.terraform.io/vultr/vultr/$VULTR_VERSION/$(go env GOOS)_$(go env GOARCH)/terraform-provider-vultr_v$VULTR_VERSION" .

RUN git init -q /src/hcloud && cd /src/hcloud \
	&& git remote add origin https://github.com/hetznercloud/terraform-provider-hcloud \
	&& git fetch -q --depth 1 origin "refs/tags/v$HCLOUD_VERSION:refs/tags/v$HCLOUD_VERSION" \
	&& test "$(git rev-parse "v$HCLOUD_VERSION^{commit}")" = "$HCLOUD_COMMIT" \
	&& git checkout -q "v$HCLOUD_VERSION" \
	&& go build -o "/out/providers/registry.terraform.io/hetznercloud/hcloud/$HCLOUD_VERSION/$(go env GOOS)_$(go env GOARCH)/terraform-provider-hcloud_v$HCLOUD_VERSION" .

RUN git init -q /src/scaleway && cd /src/scaleway \
	&& git remote add origin https://github.com/scaleway/terraform-provider-scaleway \
	&& git fetch -q --depth 1 origin "refs/tags/v$SCALEWAY_VERSION:refs/tags/v$SCALEWAY_VERSION" \
	&& test "$(git rev-parse "v$SCALEWAY_VERSION^{commit}")" = "$SCALEWAY_COMMIT" \
	&& git checkout -q "v$SCALEWAY_VERSION" \
	&& go build -o "/out/providers/registry.terraform.io/scaleway/scaleway/$SCALEWAY_VERSION/$(go env GOOS)_$(go env GOARCH)/terraform-provider-scaleway_v$SCALEWAY_VERSION" .

RUN git init -q /src/digitalocean && cd /src/digitalocean \
	&& git remote add origin https://github.com/digitalocean/terraform-provider-digitalocean \
	&& git fetch -q --depth 1 origin "refs/tags/v$DIGITALOCEAN_VERSION:refs/tags/v$DIGITALOCEAN_VERSION" \
	&& test "$(git rev-parse "v$DIGITALOCEAN_VERSION^{commit}")" = "$DIGITALOCEAN_COMMIT" \
	&& git checkout -q "v$DIGITALOCEAN_VERSION" \
	&& rm -rf vendor \
	&& go get golang.org/x/net@"$XNET_VERSION" && go mod tidy \
	&& go build -o "/out/providers/registry.terraform.io/digitalocean/digitalocean/$DIGITALOCEAN_VERSION/$(go env GOOS)_$(go env GOARCH)/terraform-provider-digitalocean_v$DIGITALOCEAN_VERSION" .

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk upgrade --no-cache \
	&& apk add --no-cache nodejs bash curl jq ca-certificates

COPY --from=build /out/bin/terraform /usr/local/bin/terraform
COPY --from=build /out/providers /opt/open-grind/providers
COPY --chmod=755 orchestrator/fetch-repo /usr/local/bin/fetch-repo
COPY orchestrator/terraformrc /opt/open-grind/terraformrc

ENV TF_CLI_CONFIG_FILE=/opt/open-grind/terraformrc CHECKPOINT_DISABLE=1

COPY terraform/boxes /tmp/mirror-check
RUN for box in /tmp/mirror-check/*/; do \
		terraform -chdir="$box" init -backend=false -input=false >/dev/null || exit 1; \
	done && rm -rf /tmp/mirror-check
