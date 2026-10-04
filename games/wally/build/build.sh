#!/usr/bin/env bash
# Rebuilds the browser version of Where's Wally? Social Distancing Edition.
# The game is the original 2021 main.cpp from github.com/dianapaula19/wheres-wally-game,
# compiled unchanged with Emscripten. shim/GL/freeglut.h stands in for freeglut and
# implements the small OpenGL/GLUT subset the game uses on an HTML canvas.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="${1:?usage: build.sh path/to/wheres-wally-game/main.cpp}"
em++ "$src" -I "$here/shim" -O2 -sALLOW_MEMORY_GROWTH=1 --shell-file "$here/shell.html" -o "$here/../index.html"
