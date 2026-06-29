$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
psql -U postgres -p 5433 -d sonbola -c "SELECT id, name, public_image_url FROM inventory;"
