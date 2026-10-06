# Devnet Kora relay with the config in this directory baked in. See README.md.
# Build context: infra/kora.
FROM rust:1.97-bookworm AS build
ARG KORA_REV=afe5e6b297c33b71293eb57da80bd8de8b40709a
RUN git clone https://github.com/solana-foundation/kora /src \
 && git -C /src checkout --detach $KORA_REV
WORKDIR /src
RUN cargo build --release --bin kora

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/kora /usr/local/bin/kora
COPY kora.devnet.toml signers.devnet.toml /etc/kora/
# KORA_SIGNER_KEY and KORA_API_KEY come from the host's secrets. RPC_URL may override this.
ENV RPC_URL=https://api.devnet.solana.com
EXPOSE 8080
CMD ["sh", "-c", "exec kora --config /etc/kora/kora.devnet.toml rpc start --signers-config /etc/kora/signers.devnet.toml --port ${PORT:-8080}"]
