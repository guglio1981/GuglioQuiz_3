const baseUrl = 'https://guglioquiz1.pockethost.io//api';

async function request(path, method, body, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Error on ${method} ${path}:`, err);
    throw new Error(err);
  }
  return res.json();
}

async function setup() {
  try {
    // 1. Create admin (the very first request without token creates the first admin)
    try {
      await request('/admins', 'POST', {
        email: 'admin@guglioquiz.local',
        password: 'guglioquiz2026',
        passwordConfirm: 'guglioquiz2026'
      });
    } catch(e) {}
    
    // 2. Auth as admin
    const authData = await request('/admins/auth-with-password', 'POST', {
      identity: 'admin@guglioquiz.local',
      password: 'guglioquiz2026'
    });
    const token = authData.token;

    // Helper to create collection
    async function createCollection(schema) {
      schema.listRule = "";
      schema.viewRule = "";
      schema.createRule = "";
      schema.updateRule = "";
      schema.deleteRule = "";
      try {
        await request('/collections', 'POST', schema, token);
        console.log(`Created collection: ${schema.name}`);
      } catch(e) {
        // Try to update if already exists
        try {
          const collection = await request(`/collections/${schema.name}`, 'GET', null, token);
          await request(`/collections/${collection.id}`, 'PATCH', schema, token);
          console.log(`Updated collection: ${schema.name}`);
        } catch(updateError) {
          console.error(`Failed to update ${schema.name}:`, updateError.message);
        }
      }
    }

    // Collections
    await createCollection({
      name: 'games',
      type: 'base',
      schema: [
        { name: 'code', type: 'text' },
        { name: 'host_id', type: 'text' },
        { name: 'topics', type: 'json', options: { maxSize: 2000000 } },
        { name: 'question_count', type: 'number' },
        { name: 'difficulty', type: 'text' },
        { name: 'max_abstentions', type: 'number' },
        { name: 'game_profile', type: 'text' },
        { name: 'arcade_games', type: 'json', options: { maxSize: 2000000 } },
        { name: 'arcade_frequency', type: 'number' },
        { name: 'status', type: 'text' },
        { name: 'manche_ready', type: 'bool' },
        { name: 'manche', type: 'number' },
        { name: 'current_question', type: 'number' },
        { name: 'topic_selection_mode', type: 'text' },
        { name: 'current_arcade_game', type: 'text' },
        { name: 'current_arcade_round', type: 'number' },
        { name: 'questions_ready', type: 'bool' },
        { name: 'questions_json', type: 'json', options: { maxSize: 2000000 } },
        { name: 'phase', type: 'text' },
      ]
    });

    await createCollection({
      name: 'players',
      type: 'base',
      schema: [
        { name: 'game_id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'avatar', type: 'text' },
        { name: 'avatar_url', type: 'url' },
        { name: 'is_host', type: 'bool' },
        { name: 'score', type: 'number' },
        { name: 'abstentions_used', type: 'number' },
        { name: 'ready', type: 'bool' },
        { name: 'topics_confirmed', type: 'bool' },
        { name: 'selected_topics', type: 'json', options: { maxSize: 2000000 } }
      ]
    });

    await createCollection({
      name: 'questions',
      type: 'base',
      schema: [
        { name: 'game_id', type: 'text' },
        { name: 'question_number', type: 'number' },
        { name: 'topic', type: 'text' },
        { name: 'question_text', type: 'text' },
        { name: 'question_type', type: 'text' },
        { name: 'options', type: 'json', options: { maxSize: 2000000 } },
        { name: 'correct_answer', type: 'text' },
        { name: 'image_url', type: 'url' }
      ]
    });

    await createCollection({
      name: 'answers',
      type: 'base',
      schema: [
        { name: 'question_id', type: 'text' },
        { name: 'player_id', type: 'text' },
        { name: 'answer', type: 'text' },
        { name: 'is_abstention', type: 'bool' },
        { name: 'response_time_ms', type: 'number' },
        { name: 'is_correct', type: 'bool' },
        { name: 'points_earned', type: 'number' },
        { name: 'points_processed', type: 'bool' }
      ]
    });

    await createCollection({
      name: 'arcade_results',
      type: 'base',
      schema: [
        { name: 'game_id', type: 'text' },
        { name: 'player_id', type: 'text' },
        { name: 'game_type', type: 'text' },
        { name: 'arcade_round', type: 'number' },
        { name: 'raw_score', type: 'number' },
        { name: 'points_earned', type: 'number' },
        { name: 'position', type: 'number' }
      ]
    });

    await createCollection({
      name: 'app_users',
      type: 'base',
      schema: [
        { name: 'username', type: 'text' },
        { name: 'password_hash', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'avatar', type: 'text' },
        { name: 'avatar_url', type: 'url' },
        { name: 'session_token', type: 'text' }
      ]
    });

    await createCollection({
      name: 'push_subscriptions',
      type: 'base',
      schema: [
        { name: 'user_id', type: 'text' },
        { name: 'endpoint', type: 'text' },
        { name: 'p256dh', type: 'text' },
        { name: 'auth', type: 'text' }
      ]
    });

    await createCollection({
      name: 'password_resets',
      type: 'base',
      schema: [
        { name: 'user_id', type: 'text' },
        { name: 'token', type: 'text' },
        { name: 'code', type: 'text' },
        { name: 'expires_at', type: 'date' },
        { name: 'used', type: 'bool' }
      ]
    });

    console.log("All collections created successfully!");
  } catch (error) {
    console.error("Setup failed:", error);
  }
}

setup();
