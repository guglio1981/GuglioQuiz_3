const baseUrl = 'https://guglioquiz1.pockethost.io/api';

async function request(path, method, body, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

async function fixMaxLength() {
  const authData = await request('/collections/_superusers/auth-with-password', 'POST', {
    identity: 'guglio19812@gmail.com',
    password: 'Gaio2025!'
  });
  const token = authData.token;

  async function setMax(collectionName, fieldName) {
    try {
      const collection = await request(`/collections/${collectionName}`, 'GET', null, token);
      
      const newFields = collection.fields.map(f => {
        if (f.name === fieldName) return { ...f, max: 5000000 };
        return f;
      });
      
      await request(`/collections/${collection.id}`, 'PATCH', { fields: newFields }, token);
      console.log(`Successfully updated max length for ${fieldName} in ${collectionName}`);
    } catch(e) {
      console.error(`Failed ${collectionName}:`, e.message);
    }
  }

  await setMax('players', 'avatar_url');
  await setMax('app_users', 'avatar_url');
  await setMax('questions', 'image_url');
}

fixMaxLength();
