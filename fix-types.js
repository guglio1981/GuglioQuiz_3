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

async function fixTypes() {
  const authData = await request('/collections/_superusers/auth-with-password', 'POST', {
    identity: 'guglio19812@gmail.com',
    password: 'Gaio2025!'
  });
  const token = authData.token;

  async function replaceField(collectionName, fieldName) {
    try {
      const collection = await request(`/collections/${collectionName}`, 'GET', null, token);
      
      // Step 1: Remove the field
      const fieldsWithout = collection.fields.filter(f => f.name !== fieldName);
      await request(`/collections/${collection.id}`, 'PATCH', { fields: fieldsWithout }, token);
      
      // Step 2: Add it back as text
      const newCollection = await request(`/collections/${collectionName}`, 'GET', null, token);
      const fieldsWithNew = [...newCollection.fields, { name: fieldName, type: 'text' }];
      await request(`/collections/${collection.id}`, 'PATCH', { fields: fieldsWithNew }, token);
      
      console.log(`Successfully replaced ${fieldName} in ${collectionName}`);
    } catch(e) {
      console.error(`Failed ${collectionName}:`, e.message);
    }
  }

  await replaceField('players', 'avatar_url');
  await replaceField('app_users', 'avatar_url');
  await replaceField('questions', 'image_url');
}

fixTypes();
