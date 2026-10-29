"""Download, but never install, the APT dependencies of the reviewed Noble recipe."""
import argparse
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
parser.add_argument("--public-ffmpeg-headers", action="store_true", help="Use public Ubuntu FFmpeg headers when ESM downloads need administrator credentials; runtime libraries are unchanged.")
args = parser.parse_args()
directory = args.directory.absolute()
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
packages_dir = directory / "packages"
packages_dir.mkdir(exist_ok=True)
recipe = Path(__file__).resolve().with_name("native-deps-ubuntu.sh")
simulation = subprocess.run(["bash", str(recipe), "--simulate"], capture_output=True, text=True, check=True)
(directory / "dependencies-simulation.log").write_text(simulation.stdout)
packages = []
fallbacks = []
ffmpeg = {"libavformat-dev", "libavcodec-dev", "libavutil-dev", "libswresample-dev"}
for line in simulation.stdout.splitlines():
    match = re.match(r"Inst ([a-z0-9][a-z0-9+.:~-]*) (?:\[[^\]]+\] )?\(([^ ]+)", line)
    if not match:
        continue
    name, version = match.groups()
    if name in ffmpeg and "+esm" in version and args.public_ffmpeg_headers:
        versions = subprocess.run(["apt-cache", "madison", name], capture_output=True, text=True, check=True).stdout
        public = [row.split("|")[1].strip() for row in versions.splitlines() if len(row.split("|")) == 3 and "+esm" not in row and "ubuntu" in row]
        if not public:
            raise SystemExit(f"No hay headers públicos disponibles para {name}.")
        fallbacks.append({"package": name, "requested": version, "publicHeaders": public[0]})
        version = public[0]
    packages.append(f"{name}={version}")
if not packages:
    raise SystemExit("APT no propone paquetes: las dependencias ya pueden estar instaladas. Usá el build del sistema; no se fabrica un entorno vacío.")
(directory / "download-plan.json").write_text(json.dumps({"packages": packages, "publicHeaderFallbacks": fallbacks}, indent=2) + "\n")
with (directory / "download.log").open("w") as log:
    result = subprocess.run(["apt-get", "download", *packages], cwd=packages_dir, stdout=log, stderr=subprocess.STDOUT)
print(f"Descarga de {len(packages)} paquetes: código {result.returncode}. Log: {directory / 'download.log'}")
raise SystemExit(result.returncode)
