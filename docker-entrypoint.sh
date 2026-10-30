#!/bin/sh
set -eu

# 容器内数据必须落在持久化卷上；.env 中的相对路径（如 ./data）不适用于镜像内部。
case "${DATA_DIR:-}" in
  /*) ;;
  *) DATA_DIR=/data ;;
esac

case "${DATABASE_PATH:-}" in
  /*) ;;
  *) DATABASE_PATH="$DATA_DIR/steam-monitor.db" ;;
esac

export DATA_DIR DATABASE_PATH
exec "$@"
