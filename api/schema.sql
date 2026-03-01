CREATE TABLE IF NOT EXISTS sync_store (
  id TEXT PRIMARY KEY DEFAULT 'main',
  incomes TEXT NOT NULL DEFAULT '[]',
  expenses TEXT NOT NULL DEFAULT '[]',
  personal_expenses TEXT NOT NULL DEFAULT '[]',
  debts TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO sync_store (id) VALUES ('main');
