const baseUrl = 'https://guglioquiz1.pockethost.io/api';
async function test() {
  const authData = await fetch(`${baseUrl}/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'guglio19812@gmail.com', password: 'Gaio2025!' })
  }).then(res => res.json());

  const token = authData.token;

  const collection = await fetch(`${baseUrl}/collections/games`, {
    headers: { 'Authorization': token }
  }).then(res => res.json());

  const newFields = [
    ...collection.fields,
    { name: 'code', type: 'text' },
    { name: 'host_id', type: 'text' },
    { name: 'topics', type: 'json' },
    { name: 'question_count', type: 'number' },
    { name: 'difficulty', type: 'text' },
    { name: 'max_abstentions', type: 'number' },
    { name: 'game_profile', type: 'text' },
    { name: 'arcade_games', type: 'json' },
    { name: 'arcade_frequency', type: 'number' },
    { name: 'status', type: 'text' },
    { name: 'manche_ready', type: 'bool' },
    { name: 'manche', type: 'number' },
    { name: 'current_question', type: 'number' },
    { name: 'topic_selection_mode', type: 'text' },
    { name: 'current_arcade_game', type: 'text' },
    { name: 'current_arcade_round', type: 'number' }
  ];

  const res = await fetch(`${baseUrl}/collections/${collection.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ fields: newFields })
  });

  console.log(res.status, await res.text());
}
test();
