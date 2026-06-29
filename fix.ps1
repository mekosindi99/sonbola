$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
psql -U postgres -p 5433 -d sonbola -c "UPDATE inventory SET public_image_url = REPLACE(public_image_url, 'https://localhost:3000', 'http://localhost:3000') WHERE public_image_url LIKE 'https://localhost:3000%';"
Write-Host "Done!" -ForegroundColor Green
