const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const baseUrl = 'https://guglioquiz1.pockethost.io/api';

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

async function runSetup(email, password) {
  try {
    console.log(`\nConnecting to ${baseUrl}...`);
    
    // 1. Auth as admin
    console.log("Authenticating...");
    const authData = await request('/collections/_superusers/auth-with-password', 'POST', {
      identity: email,
      password: password
    });
    const token = authData.token;
    console.log("Authentication successful!");

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

    console.log("\nCreating collections...");
    
    // Collections
    await createCollection({
      name: 'games',
      type: 'base',
      fields: [
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
      ]
    });

    await createCollection({
      name: 'players',
      type: 'base',
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
        { name: 'selected_topics', type: 'json', options: { maxSize: 2000000 } }
      ]
    });

    await createCollection({
      name: 'questions',
      type: 'base',
      fields: [
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
    });

    await createCollection({
      name: 'arcade_results',
      type: 'base',
      fields: [
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
      fields: [
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
      fields: [
        { name: 'user_id', type: 'text' },
        { name: 'endpoint', type: 'text' },
        { name: 'p256dh', type: 'text' },
        { name: 'auth', type: 'text' }
      ]
    });

    await createCollection({
      name: 'password_resets',
      type: 'base',
      fields: [
        { name: 'user_id', type: 'text' },
        { name: 'token', type: 'text' },
        { name: 'code', type: 'text' },
        { name: 'expires_at', type: 'date' },
        { name: 'used', type: 'bool' }
      ]
    });

    console.log("\n✅ All collections created successfully on PocketHost!");
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    if (error.message.includes("400") || error.message.includes("401")) {
      console.log("-> Make sure you entered the correct Admin Email and Password that you created on PocketHost.");
    }
  } finally {
    readline.close();
  }
}

console.log("=== PocketHost Database Setup ===");
console.log("This will automatically create your tables on https://guglioquiz1.pockethost.io");
readline.question('Enter your PocketHost Admin Email: ', (email) => {
  readline.question('Enter your PocketHost Admin Password: ', (password) => {
    runSetup(email, password);
  });
});
