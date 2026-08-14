-- Даты первого раза по каждому стилю: нужны, чтобы показать,
-- кто из вас открыл стиль раньше. Хранится как JSON {код: unix-время}.
ALTER TABLE totals ADD COLUMN styles_first TEXT;
