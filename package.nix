{
    stdenv,
    lib,
    nodejs_24,
    pnpm_10,
    pnpmConfigHook,
    fetchPnpmDeps,
}:
let
    nodejs = nodejs_24;
    pnpm = pnpm_10.override { inherit nodejs; };
in
stdenv.mkDerivation (finalAttrs: {
    pname = "plus-admin-dashboard";
    version = "0-unstable-2026-02-06";

    # Setup pnpm package source
    src = lib.sources.cleanSourceWith {
        name = "plus-admin-dashboard-src";
        src = lib.sources.cleanSourceWith {
            src = ./.;
            filter =
                name: type:
                let
                    baseName = baseNameOf (toString name);
                in
                !(builtins.elem baseName [ "dist" "node_modules" ]);
        };
        filter = lib.sources.cleanSourceFilter;
    };

    inherit nodejs pnpm;

    pnpmDeps = fetchPnpmDeps {
        inherit (finalAttrs) pname version src;
        fetcherVersion = 3;
        hash = "sha256-mkpGT5QlGQLsKaugGBQYsV4Az5FmjWD0UvBjdACU/Mo=";
    };

    buildPhase = ''
        runHook preBuild

        pnpm build

        runHook postBuild
    '';

    nativeBuildInputs = [
        nodejs
        pnpmConfigHook
        pnpm
    ];

    installPhase = ''
        runHook preInstall

        mkdir -p "$out"/share
        cp -r ./dist/* "$out"/share/

        runHook postInstall
    '';

    meta = {
        mainProgram = "start-server";
        homepage = "https://github.com/Polyfrost/plus-admin-dashboard";
    };
})
