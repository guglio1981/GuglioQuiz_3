/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection()
  collection.name = "game_history"
  collection.type = "base"
  collection.listRule = ""
  collection.viewRule = ""
  collection.createRule = ""
  collection.updateRule = null
  collection.deleteRule = null
  collection.schema = new Schema([
    new SchemaField({
      "system": false, "id": "gh_user", "name": "user",
      "type": "text", "required": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }),
    new SchemaField({
      "system": false, "id": "gh_gamenum", "name": "game_number",
      "type": "number", "required": false,
      "options": { "min": null, "max": null, "noDecimal": true }
    }),
    new SchemaField({
      "system": false, "id": "gh_code", "name": "game_code",
      "type": "text", "required": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }),
    new SchemaField({
      "system": false, "id": "gh_playedat", "name": "played_at",
      "type": "text", "required": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }),
    new SchemaField({
      "system": false, "id": "gh_score", "name": "score",
      "type": "number", "required": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    }),
    new SchemaField({
      "system": false, "id": "gh_total", "name": "total",
      "type": "number", "required": false,
      "options": { "min": null, "max": null, "noDecimal": false }
    }),
    new SchemaField({
      "system": false, "id": "gh_questions", "name": "questions_json",
      "type": "json", "required": false,
      "options": { "maxSize": 2000000 }
    }),
    new SchemaField({
      "system": false, "id": "gh_players", "name": "players_json",
      "type": "json", "required": false,
      "options": { "maxSize": 2000000 }
    }),
  ])
  const dao = new Dao(db)
  dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  try {
    const col = dao.findCollectionByNameOrId("game_history")
    dao.deleteCollection(col)
  } catch (_) {}
})
