FROM docker.io/cloudflare/sandbox:0.8.11

ARG TARGETARCH
ARG GO_VERSION=1.26.3
ARG UV_VERSION=0.11.14
ARG AGENT_BROWSER_VERSION=0.27.0

LABEL org.opencontainers.image.description="Garage browser demo sandbox image v1"

ENV DEBIAN_FRONTEND=noninteractive
ENV AGENT_BROWSER_HEADLESS=true

USER root

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      ffmpeg \
      fonts-freefont-ttf \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      git \
      jq \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo-gobject2 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libfontconfig1 \
      libfreetype6 \
      libgbm1 \
      libgdk-pixbuf-2.0-0 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb-shm0 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxkbcommon0 \
      libxrandr2 \
      libxrender1 \
      libxshmfence1 \
      python3 \
      python3-pip \
      python3-venv \
      tar \
      unzip \
      xz-utils; \
    ln -sf /usr/bin/python3 /usr/local/bin/python; \
    ln -sf /usr/bin/pip3 /usr/local/bin/pip; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) go_arch="amd64"; uv_arch="x86_64" ;; \
      arm64) go_arch="arm64"; uv_arch="aarch64" ;; \
      *) echo "Unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${go_arch}.tar.gz" -o /tmp/go.tgz; \
    rm -rf /usr/local/go; \
    tar -C /usr/local -xzf /tmp/go.tgz; \
    ln -sf /usr/local/go/bin/go /usr/local/bin/go; \
    ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt; \
    curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uv_arch}-unknown-linux-gnu.tar.gz" -o /tmp/uv.tgz; \
    mkdir -p /tmp/uv; \
    tar -C /tmp/uv --strip-components=1 -xzf /tmp/uv.tgz; \
    install -m 0755 /tmp/uv/uv /usr/local/bin/uv; \
    install -m 0755 /tmp/uv/uvx /usr/local/bin/uvx; \
    rm -rf /tmp/go.tgz /tmp/uv /tmp/uv.tgz

RUN set -eux; \
    npm install -g "agent-browser@${AGENT_BROWSER_VERSION}"; \
    agent-browser install; \
    node --version; \
    bun --version; \
    go version; \
    python --version; \
    uv --version; \
    agent-browser --version

# Documents the ports this application uses (standard Docker convention)
EXPOSE 8080
