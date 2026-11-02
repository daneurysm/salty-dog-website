PRAGMA foreign_keys = ON;
CREATE TABLE cms_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor','superuser')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER preserve_two_superusers BEFORE UPDATE OF role,active ON cms_users
WHEN OLD.role='superuser' AND OLD.active=1 AND (NEW.role!='superuser' OR NEW.active!=1)
AND (SELECT COUNT(*) FROM cms_users WHERE role='superuser' AND active=1)<=2
BEGIN SELECT RAISE(ABORT,'Keep at least two active superusers.'); END;
CREATE TRIGGER prevent_superuser_removal BEFORE DELETE ON cms_users
WHEN OLD.role='superuser' AND OLD.active=1
AND (SELECT COUNT(*) FROM cms_users WHERE role='superuser' AND active=1)<=2
BEGIN SELECT RAISE(ABORT,'Keep at least two active superusers.'); END;
CREATE TABLE dogs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  breed TEXT NOT NULL,
  sex TEXT NOT NULL CHECK(sex IN ('Male','Female')),
  age TEXT NOT NULL DEFAULT '',
  good_dogs INTEGER NOT NULL DEFAULT 0 CHECK(good_dogs IN (0,1)),
  good_small_animals INTEGER NOT NULL DEFAULT 0 CHECK(good_small_animals IN (0,1)),
  gentle_children INTEGER NOT NULL DEFAULT 0 CHECK(gentle_children IN (0,1)),
  status TEXT NOT NULL CHECK(status IN ('available','adopted')),
  description TEXT NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(photos)),
  health TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(health)),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX dogs_public ON dogs(deleted_at, name);
CREATE TABLE uploads (
  key TEXT PRIMARY KEY,
  uploaded_by TEXT NOT NULL REFERENCES cms_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE cms_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
