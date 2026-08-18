  sqlite) CONN="${DB_PATH:-${SQLITE_PATH:-./dev.sqlite}}"; export DB_PATH="$CONN" ;;
  postgres|mysql|sqlserver|oracle)
    : "${DATABASE_URL:?entrypoint: DATABASE_URL required for $DIALECT}"
    CONN="$DATABASE_URL" ;;
