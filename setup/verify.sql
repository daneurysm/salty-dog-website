SELECT name,email,role,active FROM cms_users ORDER BY name;
SELECT name,status,version FROM dogs WHERE deleted_at IS NULL ORDER BY name;
SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('preserve_two_superusers','prevent_superuser_removal');
