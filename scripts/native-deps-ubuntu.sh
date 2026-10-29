#!/usr/bin/env bash
# Dependencies reviewed against Mixxx 2.5.6 on Ubuntu 24.04 (Noble).
# This script never installs Mixxx or removes packages.
set -euo pipefail
source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 24.04 ]]; then
  printf 'Este listado fue verificado para Ubuntu 24.04. Revisá los paquetes para tu distribución.\n' >&2
  exit 1
fi
packages=(
  # Build tools.
  cmake ninja-build pkg-config
  # Qt GUI, controller scripting, native IPC and shader/QML compilation.
  qt6-base-dev qt6-base-private-dev qt6-declarative-dev qt6-declarative-private-dev
  qt6-5compat-dev qt6-shadertools-dev libqt6opengl6-dev qt6-svg-dev qtkeychain-qt6-dev
  # Audio devices, decoders, analysis, metadata, MIDI/HID and supporting libraries.
  libavformat-dev libavcodec-dev libavutil-dev libchromaprint-dev libebur128-dev
  libfaad-dev libfftw3-dev libflac-dev libgl1-mesa-dev libhidapi-dev libid3tag0-dev
  liblilv-dev libmad0-dev libmodplug-dev libmp3lame-dev libmsgsl-dev libopus-dev
  libopusfile-dev libportmidi-dev libprotobuf-dev librubberband-dev libshout-idjc-dev
  libsndfile1-dev libsoundtouch-dev libsqlite3-dev libssl-dev libtag1-dev libudev-dev
  libupower-glib-dev libusb-1.0-0-dev libwavpack-dev lv2-dev libjack-jackd2-dev
  portaudio19-dev protobuf-compiler
  # Upstream tests and benchmarks.
  libgmock-dev libgtest-dev libbenchmark-dev
)
case "${1:---simulate}" in
  --list) printf '%s\n' "${packages[@]}" ;;
  --simulate) exec apt-get --simulate --no-remove --no-install-recommends install "${packages[@]}" ;;
  --install) exec sudo apt-get --no-remove --no-install-recommends install "${packages[@]}" ;;
  *) printf 'Uso: bash scripts/native-deps-ubuntu.sh [--simulate|--list|--install]\n' >&2; exit 1 ;;
esac
