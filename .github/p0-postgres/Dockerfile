ARG POSTGRES_IMAGE=postgres:17.11-bookworm
FROM ${POSTGRES_IMAGE}

ARG PG_MAJOR
RUN apt-get update \
  && apt-get install --yes --no-install-recommends "postgresql-${PG_MAJOR}-cron" \
  && rm -rf /var/lib/apt/lists/*

CMD ["postgres", "-c", "shared_preload_libraries=pg_cron", "-c", "cron.database_name=postgres"]
