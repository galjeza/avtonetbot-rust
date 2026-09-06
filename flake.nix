{
  description = "avtonetbot system libraries (Tauri on Linux)";

  # Pinned so a nixos-rebuild cannot change the WebKit/GTK the project builds
  # against. Bump deliberately.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/e5bdc4a41d4c072fe1e3787eaa0320a384741d44";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      # rustc, cargo and node come from the system profile on purpose, so the
      # editor's rust-analyzer and this shell always agree on one toolchain.
      devShells.${system}.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [ pkg-config wrapGAppsHook3 ];

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
        '';
      };
    };
}
