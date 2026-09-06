# Avtonet ad renewal automation in rust

Desktop application built with Tauri 2, Rust and React + TypeScript.

## Development

Rust, Node and the GTK/WebKit libraries are pinned in `flake.nix`:

```sh
nix develop          # enter the dev environment
npm install          # first time only
npm run tauri dev    # launch the app
```

Release binary (`src-tauri/target/release/avtonetbot`):

```sh
npm run tauri build -- --no-bundle
```

## Layout

- `src/` — React + TypeScript frontend
- `src-tauri/` — Rust backend and Tauri configuration
- `flake.nix` — pinned development environment
