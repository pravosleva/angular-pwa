#!/bin/bash

# Останавливать выполнение скрипта при любой ошибке
set -e

# Инициализация флага dry-run
DRY_RUN=false

# Обработка аргументов командной строки
for arg in "$@"; do
    if [ "$arg" == "--dry-run" ]; then
        DRY_RUN=true
        echo "=== DRY RUN MODE ENABLED ==="
    fi
done

# --- БЛОК АВТОПЕРЕКЛЮЧЕНИЯ ВЕРСИИ NODE.JS ---
NODE_REQ_VERSION="24.15.0"

if [ -f ".nvmrc" ]; then
    NODE_REQ_VERSION=$(cat .nvmrc | tr -d '[:space:]')
    echo "--> Detected Node.js version from .nvmrc: $NODE_REQ_VERSION"
fi

echo "--> Setting up Node.js environment..."

if [ -d "$HOME/.local/share/fnm" ] || command -v fnm &> /dev/null; then
    eval "$(fnm env --use-on-cd)"
    fnm use "$NODE_REQ_VERSION" || fnm install "$NODE_REQ_VERSION" && fnm use "$NODE_REQ_VERSION"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    nvm use "$NODE_REQ_VERSION" || nvm install "$NODE_REQ_VERSION" && nvm use "$NODE_REQ_VERSION"
else
    echo "WARNING: Using system Node.js."
fi
echo "Current Node.js version: $(node -v)"
# --------------------------------------------

# --- 🔥 НОВЫЙ НАЦИВНЫЙ БЛОК ЧТЕНИЯ .env.production.local ---
ENV_FILE=".env.production.local"

if [ -f "$ENV_FILE" ]; then
    echo "--> Reading environment from $ENV_FILE..."
    # Извлекаем переменную, убираем возможные кавычки и пробелы
    PROD_TARGET_PATH_BUILD_DIR=$(grep -v '^#' "$ENV_FILE" | grep 'PROD_TARGET_PATH_BUILD_DIR=' | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
fi

# Проверка, что переменная успешно считалась
if [ -z "$PROD_TARGET_PATH_BUILD_DIR" ]; then
    echo "ERROR: PROD_TARGET_PATH_BUILD_DIR is empty or not found in $ENV_FILE! Deploy aborted." >&2
    exit 1
fi

echo "--> Target remote path: $PROD_TARGET_PATH_BUILD_DIR"
# ------------------------------------------------------------

# Сборка Angular 20+ PWA приложения via esbuild
echo '--> Building Autopark PWA via esbuild... 🛠️'
yarn build

ANGULAR_DIST_DIR="dist/autopark-pwa/browser"

if [ ! -d "$ANGULAR_DIST_DIR" ] || [ -z "$(ls -A $ANGULAR_DIST_DIR)" ]; then
    echo "ERROR: Build folder '$ANGULAR_DIST_DIR' is missing or empty! Deploy aborted." >&2
    exit 1
fi

# Удаленный деплой через SSH rsync
if [ "$DRY_RUN" = true ]; then
    echo '-- [DRY-RUN] REMOTE PWA DEPLOY STARTED 🛫 (Simulation)'

    # Добавляем слеш к ANGULAR_DIST_DIR/, чтобы копировалось содержимое, а не сама папка browser
    rsync -a --dry-run --delete --itemize-changes "$ANGULAR_DIST_DIR/" "$PROD_TARGET_PATH_BUILD_DIR" | grep -v '^\.' || true

    echo '-- [DRY-RUN] REMOTE PWA DEPLOY COMPLETED 🛬 (Simulation)'
else
    echo '-- REMOTE PWA DEPLOY STARTED 🛫'

    # Боевой rsync на удаленный IP сервера 83.220.170.212
    rsync -av --delete "$ANGULAR_DIST_DIR/" "$PROD_TARGET_PATH_BUILD_DIR"

    echo '-- REMOTE PWA DEPLOY COMPLETED 🛬'
fi
