-- Short headline shown as the toast/tray bold title; the existing `message`
-- column remains the full sentence. Nullable — notify() always derives one
-- when a caller doesn't pass an explicit title, but rows written before this
-- migration have no title on file, and reads fall back to deriving one
-- client-side from `message` in that case.
ALTER TABLE notifications ADD COLUMN title text;
