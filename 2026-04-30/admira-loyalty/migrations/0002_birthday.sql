-- Birthday is stored as ISO MM-DD (e.g. "07-15"). Optional; null means the
-- customer didn't share it.
ALTER TABLE customers ADD COLUMN birthday TEXT;
