const baseUrl = 'https://guglioquiz1.pockethost.io/api';
async function test() {
  const authData = await fetch(`${baseUrl}/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'guglio19812@gmail.com', password: 'Gaio2025!' })
  }).then(res => res.json());

  const collections = await fetch(`${baseUrl}/collections`, {
    headers: { 'Authorization': authData.token }
  }).then(res => res.json());

  console.log("GAMES COLLECTION:");
  console.log(JSON.stringify(collections.items.find(c => c.name === 'games'), null, 2));
}
test();
