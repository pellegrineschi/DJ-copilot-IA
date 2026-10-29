#!/usr/bin/env bash
# Run a build/test with locally extracted Ubuntu dependencies; never installs them.
set -euo pipefail
if [[ $# -lt 2 ]]; then
  printf 'Uso: bash scripts/native-local-env.sh /ruta/deps/root comando [argumentos...]\n' >&2
  exit 1
fi
deps_root=$(realpath "$1")
shift
if [[ ! -x "$deps_root/usr/bin/cmake" || ! -d "$deps_root/usr/include" ]]; then
  printf 'No se encontró un entorno local de dependencias completo.\n' >&2
  exit 1
fi
export PATH="$deps_root/usr/bin:$PATH"
export LD_LIBRARY_PATH="$deps_root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PKG_CONFIG_PATH="$deps_root/usr/lib/x86_64-linux-gnu/pkgconfig:$deps_root/usr/lib/pkgconfig:$deps_root/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export CMAKE_PREFIX_PATH="$deps_root/usr${CMAKE_PREFIX_PATH:+:$CMAKE_PREFIX_PATH}"
# Debian splits OpenSSL/FFmpeg headers into the multiarch include directory.
export C_INCLUDE_PATH="$deps_root/usr/include/x86_64-linux-gnu${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
export CPLUS_INCLUDE_PATH="$deps_root/usr/include/x86_64-linux-gnu${CPLUS_INCLUDE_PATH:+:$CPLUS_INCLUDE_PATH}"
export DJ_COPILOT_QT_HEADERS="$deps_root/usr/include/x86_64-linux-gnu/qt6"
exec "$@"
