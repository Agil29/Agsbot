import { run } from "./db";
import { logger } from "./logger";

export async function initDb(): Promise<void> {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id BIGINT PRIMARY KEY,
        first_name  TEXT NOT NULL,
        last_name   TEXT,
        username    TEXT,
        uid         INTEGER NOT NULL,
        reg_date    TIMESTAMPTZ DEFAULT now(),
        saldo       BIGINT NOT NULL DEFAULT 0,
        whatsapp    VARCHAR(20)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS orders (
        id             TEXT PRIMARY KEY,
        user_id        BIGINT NOT NULL,
        user_name      TEXT NOT NULL,
        user_username  VARCHAR(100),
        category       TEXT NOT NULL,
        package_id     TEXT NOT NULL,
        package_name   TEXT NOT NULL,
        price          BIGINT DEFAULT 0,
        baseprice      NUMERIC DEFAULT 0,
        quota          TEXT DEFAULT '',
        validity       TEXT DEFAULT '',
        nomor_tujuan   TEXT,
        sn             TEXT,
        reff_id        TEXT,
        payment_method TEXT,
        status         TEXT DEFAULT 'pending',
        created_at     TIMESTAMPTZ DEFAULT now(),
        updated_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS topups (
        id            TEXT PRIMARY KEY,
        user_id       BIGINT NOT NULL,
        chat_id       BIGINT NOT NULL,
        user_name     TEXT NOT NULL,
        nominal       BIGINT NOT NULL,
        fee           BIGINT DEFAULT 0,
        total         BIGINT NOT NULL,
        qris_string   TEXT,
        status        TEXT DEFAULT 'pending',
        created_at    TIMESTAMPTZ DEFAULT now(),
        expires_at    TIMESTAMPTZ NOT NULL,
        order_payload JSONB
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS markup_settings (
        category VARCHAR(20) PRIMARY KEY,
        type     VARCHAR(10) NOT NULL DEFAULT 'flat',
        amount   NUMERIC NOT NULL DEFAULT 0
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS manual_packages (
        id          TEXT PRIMARY KEY,
        category    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        price       BIGINT DEFAULT 0,
        quota       TEXT DEFAULT '',
        validity    TEXT DEFAULT '',
        active      BOOLEAN DEFAULT true,
        sku         TEXT,
        stock       INTEGER
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS package_overrides (
        package_id TEXT PRIMARY KEY,
        overrides  JSONB DEFAULT '{}'
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS saldo_logs (
        id             SERIAL PRIMARY KEY,
        telegram_id    BIGINT NOT NULL,
        delta          BIGINT NOT NULL,
        balance_before BIGINT NOT NULL,
        balance_after  BIGINT NOT NULL,
        type           VARCHAR(30) NOT NULL,
        ref_id         TEXT,
        note           TEXT,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    await run(`CREATE INDEX IF NOT EXISTS idx_saldo_logs_telegram_id ON saldo_logs (telegram_id, created_at DESC)`);

    await run(`
      CREATE TABLE IF NOT EXISTS blacklist (
        telegram_id BIGINT PRIMARY KEY,
        reason      TEXT,
        blocked_at  TIMESTAMPTZ DEFAULT now()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS product_markup (
        sku        TEXT PRIMARY KEY,
        category   VARCHAR(20) NOT NULL,
        type       VARCHAR(10) NOT NULL DEFAULT 'flat',
        amount     NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Safe column additions for any future migrations
    await run("ALTER TABLE users  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20)").catch(() => {});
    await run("ALTER TABLE orders ADD COLUMN IF NOT EXISTS baseprice NUMERIC DEFAULT 0").catch(() => {});
    await run("ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_username VARCHAR(100)").catch(() => {});

    logger.info("Database schema initialised / verified");
  } catch (err) {
    logger.error({ err }, "initDb failed");
    throw err;
  }
}
