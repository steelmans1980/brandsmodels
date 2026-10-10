-- Removes the unused tables created by the retired 0001 migration. They were never used by The Car Archive.
DROP TABLE IF EXISTS favourites;
DROP TABLE IF EXISTS fav_networks;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS submissions;
