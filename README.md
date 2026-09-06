# Avtonet ad renewal automation in rust

Desktop application built with Tauri 2, Rust and React + TypeScript.

## Development

```sh
npm install          # first time only
npm run tauri dev    # launch the app in development mode
```

Release binary (`src-tauri/target/release/avtonetbot`):

```sh
npm run tauri build -- --no-bundle
```

## Setting up a machine

You need Rust, Node 24 and — on Linux — the GTK/WebKit development libraries.

### With Nix (any distro, recommended)

Everything is pinned in `flake.nix`, so no global installation is required:

```sh
nix develop
```

Run the `npm` commands above inside that shell.

### Without Nix

Install Rust (via [rustup](https://rustup.rs)) and Node 24, then the Tauri
system dependencies:

```sh
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libssl-dev librsvg2-dev libdbus-1-dev pkg-config build-essential

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel \
  openssl-devel librsvg2-devel dbus-devel pkgconf-pkg-config
```

macOS and Windows need no extra libraries — Tauri uses the system WebView
(WebKit and WebView2 respectively).

## Layout

- `src/` — React + TypeScript frontend
- `src-tauri/` — Rust backend and Tauri configuration
- `flake.nix` — pinned development environment
