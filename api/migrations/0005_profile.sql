-- Свой профиль поверх телеграмного.
--
-- Имя из Telegram перезаписывается при каждом входе (ensureUser), поэтому
-- своё живёт отдельной колонкой — иначе его затирало бы на первом же запуске.
ALTER TABLE users ADD COLUMN custom_name TEXT;

-- Значок и цвет фона в виде строки «🍺|#E58500»: картинок не требует,
-- а друзьям видно сразу, без единого запроса за изображением.
ALTER TABLE users ADD COLUMN avatar TEXT;

-- Своё фото — идентификатор файла в Telegram, как у этикеток
ALTER TABLE users ADD COLUMN avatar_file_id TEXT;
