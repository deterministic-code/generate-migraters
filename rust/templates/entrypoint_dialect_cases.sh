  sqlite) CONN="${DB_PATH:-${SQLITE_PATH:-./dev.sqlite}}"; export DATABASE_URL="sqlite://$CONN" ;;
  postgres|mysql)
    : "${DATABASE_URL:?entrypoint: DATABASE_URL required for $DIALECT}"
    CONN="$DATABASE_URL" ;;
