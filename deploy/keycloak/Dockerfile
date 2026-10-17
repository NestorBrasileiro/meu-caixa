# syntax=docker/dockerfile:1
#
# Keycloak "otimizado" para produção: as opções de build (banco Postgres,
# endpoints de health) são aplicadas uma vez aqui, e o container sobe com
# `start --optimized`, sem refazer o build a cada start (mais rápido e com
# menos memória num Droplet pequeno).
ARG KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.3.4

FROM ${KEYCLOAK_IMAGE} AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM ${KEYCLOAK_IMAGE}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Realm de produção (placeholders ${...} resolvidos pelas variáveis de ambiente
# na importação). Só é importado se o realm ainda não existir no banco.
COPY realm.json /opt/keycloak/data/import/meu-caixa-realm.json
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
