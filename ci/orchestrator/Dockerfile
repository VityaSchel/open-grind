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

COPY lib.sh provision.sh teardown.sh /src/ci/
COPY orchestrator/terraformrc /src/ci/orchestrator/terraformrc
COPY terraform/*.tf terraform/builder.sh /src/ci/terraform/
RUN cd /src/ci \
	&& for f in lib.sh provision.sh teardown.sh orchestrator/terraformrc terraform/*; do \
		printf '%s %s\n' "$(git hash-object "$f")" "$f"; \
	done > /out/manifest

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk upgrade --no-cache \
	&& apk add --no-cache nodejs bash curl jq ca-certificates

COPY --from=build /out/bin/terraform /usr/local/bin/terraform
COPY --from=build /out/providers /opt/open-grind/providers
COPY --from=build /out/manifest /opt/open-grind/manifest
COPY --from=build /src/ci/lib.sh /src/ci/provision.sh /src/ci/teardown.sh /opt/open-grind/
COPY --from=build /src/ci/orchestrator/terraformrc /opt/open-grind/terraformrc
COPY --from=build /src/ci/terraform/ /opt/open-grind/terraform/

ENV TF_CLI_CONFIG_FILE=/opt/open-grind/terraformrc CHECKPOINT_DISABLE=1
RUN terraform -chdir=/opt/open-grind/terraform init -backend=false -input=false
