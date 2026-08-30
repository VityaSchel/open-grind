---
prev: false
next: false
---

# [**Download Open Grind**](https://git.opengrind.org/open-grind/open-grind/releases#install)

Never install Open Grind from unofficial sources. The only official source of Open Grind releases is https://git.opengrind.org/open-grind/open-grind/releases. All releases are signed and reproducible.

> [!Warning] 🚧&nbsp;&nbsp;Beta MVP version&nbsp;&nbsp;🚧
> Open Grind is in active development. [Contribute to the project](https://git.opengrind.org/open-grind/open-grind/) or [join the discussion](https://matrix.to/#/#opengrind:opengrind.org) to help us prioritize features and improvements.

> [!Important] <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSIxNiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0yNi41NiAxNi4yNWMwLS43OC0uMDctMS41My0uMi0yLjI1SDE2djQuMjZoNS45MmMtLjI2IDEuMzctMS4wNCAyLjUzLTIuMjEgMy4zMXYyLjc3aDMuNTdjMi4wOC0xLjkyIDMuMjgtNC43NCAzLjI4LTguMDkiIGZpbGw9IiM0Mjg1ZjQiLz48cGF0aCBkPSJNMTYgMjdjMi45NyAwIDUuNDYtLjk4IDcuMjgtMi42NmwtMy41Ny0yLjc3Yy0uOTguNjYtMi4yMyAxLjA2LTMuNzEgMS4wNi0yLjg2IDAtNS4yOS0xLjkzLTYuMTYtNC41M0g2LjE4djIuODRDNy45OSAyNC41MyAxMS43IDI3IDE2IDI3IiBmaWxsPSIjMzRhODUzIi8+PHBhdGggZD0iTTkuODQgMTguMDljLS4yMi0uNjYtLjM1LTEuMzYtLjM1LTIuMDlzLjEzLTEuNDMuMzUtMi4wOXYtMi44NEg2LjE4QzUuNDMgMTIuNTUgNSAxNC4yMiA1IDE2cy40MyAzLjQ1IDEuMTggNC45M2wyLjg1LTIuMjJ6IiBmaWxsPSIjZmJiYzA1Ii8+PHBhdGggZD0iTTE2IDkuMzhjMS42MiAwIDMuMDYuNTYgNC4yMSAxLjY0bDMuMTUtMy4xNUMyMS40NSA2LjA5IDE4Ljk3IDUgMTYgNWMtNC4zIDAtOC4wMSAyLjQ3LTkuODIgNi4wN2wzLjY2IDIuODRjLjg3LTIuNiAzLjMtNC41MyA2LjE2LTQuNTMiIGZpbGw9IiNlYTQzMzUiLz48L3N2Zz4=" width="16" height="16" style="margin-block-end: 2px; margin-inline-end: 2px;" class="inline"></img> Sign in with Google
> If you use **Sign in with Google**, [read this page](/guides/sign-in-with-google).

## Linux: track updates with apt

Debian, Ubuntu and derivatives can install Open Grind from the project's own repository, so `apt` handles updates:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://git.opengrind.org/api/packages/open-grind/debian/repository.key \
	| sudo tee /etc/apt/keyrings/opengrind.asc > /dev/null
sudo tee /etc/apt/sources.list.d/opengrind.sources > /dev/null <<'EOF'
Types: deb
URIs: https://git.opengrind.org/api/packages/open-grind/debian
Suites: stable
Components: main
Signed-By: /etc/apt/keyrings/opengrind.asc
EOF
sudo apt update && sudo apt install open-grind
```

Use `Suites: beta` to track prereleases. To remove the repository, delete both files.

> [!Note] Trust
> The repository index is signed by a key held on the server. The release artifacts and their `.minisig` signatures stay the canonical, reproducible download — the repository only exists so updates arrive through your package manager.
