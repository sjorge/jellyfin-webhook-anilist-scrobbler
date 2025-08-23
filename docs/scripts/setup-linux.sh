#!/bin/bash

## Pre-flight checks
if ! which git >/dev/null 2>&1; then
    echo "ERR: Please install git."
    exit 1
fi

if ! which bun >/dev/null 2>&1; then
    echo "ERR: Please install bun."
    exit 1
fi

## Helpers
usage() {
    echo "Usage: $(basename "$0") <path_to_install> [instance-name]"
    echo
    echo "Single Instance:"
    echo "$(basename "$0") /opt/anilistscrobbler"
    echo
    echo "Multi Instance:"
    echo "$(basename "$0") /opt/anilistscrobbler myanilistuser"
    echo "$(basename "$0") /opt/anilistscrobbler partneranilistuser"
    exit 1
}

do_as_root() {
    local command="$@"
    if [ "$(id -u)" -ne 0 ]; then
        sudo $command || {
            echo "ERR: Failed to execute command with sudo: $command"
            exit 2
        }
    else
        $command || {
            echo "ERR: Failed to execute command: $command"
            exit 2
        }
    fi
}

clone_or_pull() {
    if [ ! -d "${INSTALL_TARGET}" ]; then
        echo "Cloning anilist-scrobller into ${INSTALL_TARGET} ..."
        git clone "https://github.com/${INSTALL_SOURCE}.git" "${INSTALL_TARGET}" || {
            echo "ERR: Failed to clone repository."
            exit 2
        }
    else
        pushd "${INSTALL_TARGET}" >/dev/null
        if [ "$(git remote -v | grep -c "${INSTALL_SOURCE}")" -ne 2 ]; then
            echo "ERR: ${INSTALL_TARGET} does not contain a clone of ${INSTALL_SOURCE}!"
            exit 2
        fi
        echo "Updating anilist-scrobller ..."
        git pull || {
            echo "ERR: Failed to update repository."
            exit 2
        }
        popd >/dev/null
    fi
}

build_bin() {
    pushd "${INSTALL_TARGET}" >/dev/null
    echo "Building binary ..."
    mkdir -p "etc/"
    bun install --no-save --production || {
        echo "ERR: Failed to build the binary."
        exit 2
    }
    popd >/dev/null
}

print_instance_configuration() {
    local config="${1}"
    local svc_inst="${2}"
    echo "Please complete the configuration before enabling the service:"
    echo "  export ANILISTWATCHED_CONFIG=${config}"
    echo "  ${INSTALL_TARGET}/bin/anilist-scrobbler configure --anilist-token MY_VERY_LONG_TOKEN_STRING_HERE"
    echo "  ${INSTALL_TARGET}/bin/anilist-scrobbler configure --jellyfin-api-key MY_API_KEY"
    echo "  sudo systemctl enable --now ${svc_inst}"
}

systemd_single_instance() {
    local svc_name="anilist-scrobbler.service"
    local svc_inst_config="${INSTALL_TARGET}/etc/config.toml"
    if [ -f "/usr/lib/systemd/system/${svc_name}" ]; then
        echo "WRN: Already found single-instance service, skipping systemd service install."
    else
        pushd "${INSTALL_TARGET}" >/dev/null
        local tmpsvc="$(mktemp)"
        cp "docs/systemd/single-instance.service" "${tmpsvc}"
        sed -i "s#/opt/anilistscrobbler#${INSTALL_TARGET}#g" "${tmpsvc}"
        do_as_root mv "${tmpsvc}" "/usr/lib/systemd/system/${svc_name}"
        do_as_root systemctl daemon-reload
        popd >/dev/null
    fi

    if [ -f "${INSTALL_TARGET}/etc/config.toml" ]; then
        echo "Configuration found. Done."
    else
        print_instance_configuration "${svc_inst_config}" "${svc_name}"
    fi
}

systemd_multi_instance() {
    local svc_name="anilist-scrobbler@.service"
    local svc_inst_name="anilist-scrobbler@${INSTALL_INSTANCE}.service"
    local svc_inst_config="${INSTALL_TARGET}/etc/config-${INSTALL_INSTANCE}.toml"
    if [ -f "/usr/lib/systemd/system/${svc_name}" ]; then
        echo "WRN: Already found multi-instance service, skipping systemd service install."
    else
        pushd "${INSTALL_TARGET}" >/dev/null
        local tmpsvc="$(mktemp)"
        cp "docs/systemd/multi-instance@.service" "${tmpsvc}"
        sed -i "s#/opt/anilistscrobbler#${INSTALL_TARGET}#g" "${tmpsvc}"
        do_as_root mv "${tmpsvc}" "/usr/lib/systemd/system/${svc_name}"
        do_as_root systemctl daemon-reload
        popd >/dev/null
    fi

    if [ -f "${INSTALL_TARGET}/etc/config-${INSTALL_INSTANCE}.toml" ]; then
        echo "Configuration found. Done."
    else
        print_instance_configuration "${svc_inst_config}" "${svc_inst_name}"
    fi
}

## Main
[ "$#" -lt 1 ] && usage

INSTALL_SOURCE="sjorge/jellyfin-webhook-anilist-scrobbler"
INSTALL_TARGET="${1}"
INSTALL_INSTANCE="${2:-NONE}"

clone_or_pull
build_bin
[ "${INSTALL_INSTANCE}" == "NONE" ] && systemd_single_instance || systemd_multi_instance
