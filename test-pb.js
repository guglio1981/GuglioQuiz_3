const baseUrl = 'https://guglioquiz1.pockethost.io/api';
fetch(`${baseUrl}/collections/app_users/records`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'testuser2026', password_hash: '123456' })
}).then(async res => {
  console.log(res.status, await res.text());
});
