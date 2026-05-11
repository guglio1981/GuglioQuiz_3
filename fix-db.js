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

async function fix() {
  const authData = await request('/collections/_superusers/auth-with-password', 'POST', {
    identity: 'guglio19812@gmail.com',
    password: 'Gaio2025!'
  });
  const token = authData.token;

  const collectionsData = [
    {
      name: 'games',
      fields: [
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
      ]
    },
    {
      name: 'players',
      fields: [
        { name: 'game_id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'avatar', type: 'text' },
        { name: 'avatar_url', type: 'url' },
        { name: 'is_host', type: 'bool' },
        { name: 'score', type: 'number' },
        { name: 'abstentions_used', type: 'number' },
        { name: 'ready', type: 'bool' },
        { name: 'topics_confirmed', type: 'bool' },
        { name: 'selected_topics', type: 'json' }
      ]
    },
    {
      name: 'questions',
      fields: [
        { name: 'game_id', type: 'text' },
        { name: 'question_number', type: 'number' },
        { name: 'topic', type: 'text' },
        { name: 'question_text', type: 'text' },
        { name: 'question_type', type: 'text' },
        { name: 'options', type: 'json' },
        { name: 'correct_answer', type: 'text' },
        { name: 'image_url', type: 'url' }
      ]
    },
    {
      name: 'answers',
      fields: [
        { name: 'question_id', type: 'text' },
        { name: 'player_id', type: 'text' },
        { name: 'answer', type: 'text' },
        { name: 'is_abstention', type: 'bool' },
        { name: 'response_time_ms', type: 'number' },
        { name: 'is_correct', type: 'bool' },
        { name: 'points_earned', type: 'number' },
        { name: 'points_processed', type: 'bool' }
      ]
    },
    {
      name: 'arcade_results',
      fields: [
        { name: 'game_id', type: 'text' },
        { name: 'player_id', type: 'text' },
        { name: 'game_type', type: 'text' },
        { name: 'arcade_round', type: 'number' },
        { name: 'raw_score', type: 'number' },
        { name: 'points_earned', type: 'number' },
        { name: 'position', type: 'number' }
      ]
    },
    {
      name: 'app_users',
      fields: [
        { name: 'username', type: 'text' },
        { name: 'password_hash', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'avatar', type: 'text' },
        { name: 'avatar_url', type: 'url' },
        { name: 'session_token', type: 'text' }
      ]
    },
    {
      name: 'push_subscriptions',
      fields: [
        { name: 'user_id', type: 'text' },
        { name: 'endpoint', type: 'text' },
        { name: 'p256dh', type: 'text' },
        { name: 'auth', type: 'text' }
      ]
    },
    {
      name: 'password_resets',
      fields: [
        { name: 'user_id', type: 'text' },
        { name: 'token', type: 'text' },
        { name: 'code', type: 'text' },
        { name: 'expires_at', type: 'date' },
        { name: 'used', type: 'bool' }
      ]
    }
  ];

  for (const c of collectionsData) {
    try {
      const collection = await request(`/collections/${c.name}`, 'GET', null, token);
      
      // Filter out fields that already exist
      const existingFieldNames = collection.fields.map(f => f.name);
      const newFields = c.fields.filter(f => !existingFieldNames.includes(f.name));
      
      if (newFields.length > 0) {
        const payload = {
          fields: [...collection.fields, ...newFields]
        };
        await request(`/collections/${collection.id}`, 'PATCH', payload, token);
        console.log(`Updated ${c.name} with ${newFields.length} new fields`);
      } else {
        console.log(`${c.name} already has all fields`);
      }
    } catch(e) {
      console.error(`Failed on ${c.name}:`, e.message);
    }
  }
}
fix();
