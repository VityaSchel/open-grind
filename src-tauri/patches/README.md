# Vendored cargo patches

`tauri-codegen` generates embedded assets and CSP hashes in hash map order during build and cause non-determenism during build.

`tauri-codegen/` is **generated**, do not edit it. Wipe and regenerate any time with:

```sh
bun vendor:tauri-codegen
```

To change the patch, edit the `.patch` file and regenerate.

- Remove `tauri-codegen` once https://github.com/tauri-apps/tauri/pull/15777 is merged
