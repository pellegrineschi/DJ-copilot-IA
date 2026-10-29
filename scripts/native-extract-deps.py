"""Extract downloaded Ubuntu .deb files into a NEW private build prefix.

Never invokes sudo/dpkg installation or changes the system package database.
Runtime libraries already installed on this host are referenced, not copied.
This is a local build environment, not a portable distributable SDK.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


if len(sys.argv) != 3:
    raise SystemExit("Uso: python3 scripts/native-extract-deps.py /paquetes-deb /destino-nuevo/root")
packages = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).absolute()
if root.exists() or root.is_symlink():
    raise SystemExit("El destino ya existe. Se rechaza extraer sobre archivos o enlaces previos.")
archives = sorted(packages.glob("*.deb"))
if not archives:
    raise SystemExit("No hay paquetes .deb descargados.")
root.mkdir(parents=True, mode=0o700)
root = root.resolve(strict=True)
manifest = []
for archive in archives:
    subprocess.run(["dpkg-deb", "-x", str(archive), str(root)], check=True)
    manifest.append({"file": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()})

# Debian development symlinks point to runtime files in the same multiarch dir.
# Supply those from this host without touching /usr. Qt also validates plugin paths.
system_lib = Path("/usr/lib/x86_64-linux-gnu")
paths = list(system_lib.glob("*.so*")) + list((system_lib / "qt6").rglob("*"))
linked = 0
for path in paths:
    if not path.is_file():
        continue
    target = root / path.relative_to("/")
    if not os.path.lexists(target):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(path)
        linked += 1
for pc in root.rglob("*.pc"):
    if not pc.is_symlink():
        pc.write_text(pc.read_text().replace("=/usr", "=" + str(root / "usr")))
(root.parent / "extraction-manifest.json").write_text(json.dumps({
    "root": str(root), "packages": manifest, "hostRuntimeLinks": linked,
}, indent=2) + "\n")
print(f"{len(archives)} paquetes extraídos y {linked} enlaces locales. Sin instalar paquetes del sistema.")
