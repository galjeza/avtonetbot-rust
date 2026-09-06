{
  description = "avtonetbot development environment (Tauri + React + TypeScript)";

  # Pinned so every developer and CI build resolves the same toolchain and
  # system libraries. Bump deliberately, never implicitly.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/e5bdc4a41d4c072fe1e3787eaa0320a384741d44";

  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
    in
    {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          default = pkgs.mkShell {
            nativeBuildInputs = with pkgs; [
              rustc
              cargo
              pkg-config
              nodejs_24
              wrapGAppsHook3
            ];

            # Libraries Tauri links against on Linux.
            buildInputs = with pkgs; [
              webkitgtk_4_1
              gtk3
              libsoup_3
              glib-networking
              librsvg
              openssl
            ];

            shellHook = ''
              # glib-networking provides the TLS backend WebKit needs for https://.
              export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules''${GIO_EXTRA_MODULES:+:$GIO_EXTRA_MODULES}"
              # WebKit's DMA-BUF renderer is unreliable under Wayland.
              export WEBKIT_DISABLE_DMABUF_RENDERER=1
            '';
          };
        });
    };
}
