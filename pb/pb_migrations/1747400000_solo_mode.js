/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  // Add solo_mode to games collection
  const dao = new Dao(db)
  const games = dao.findCollectionByNameOrId("gjnnw9youlpqkez")
  games.schema.addField(new SchemaField({
    "system": false,
    "id": "solo1mode1",
    "name": "solo_mode",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))
  dao.saveCollection(games)

  // Create solo_results collection
  const collection = new Collection()
  collection.name = "solo_results"
  collection.type = "base"
  collection.listRule = ""
  collection.viewRule = ""
  collection.createRule = ""
  collection.updateRule = null
  collection.deleteRule = null
  collection.schema = new Schema([
    new SchemaField({ "system": false, "id": "sr_userid", "name": "user_id", "type": "text", "required": false, "options": { "min": null, "max": null, "pattern": "" } }),
    new SchemaField({ "system": false, "id": "sr_score", "name": "score", "type": "number", "required": false, "options": { "min": null, "max": null, "noDecimal": false } }),
    new SchemaField({ "system": false, "id": "sr_correct", "name": "correct_answers", "type": "number", "required": false, "options": { "min": null, "max": null, "noDecimal": false } }),
    new SchemaField({ "system": false, "id": "sr_total", "name": "total_questions", "type": "number", "required": false, "options": { "min": null, "max": null, "noDecimal": false } }),
    new SchemaField({ "system": false, "id": "sr_topics", "name": "topics", "type": "json", "required": false, "options": { "maxSize": 2000000 } }),
    new SchemaField({ "system": false, "id": "sr_diff", "name": "difficulty", "type": "text", "required": false, "options": { "min": null, "max": null, "pattern": "" } }),
    new SchemaField({ "system": false, "id": "sr_profile", "name": "game_profile", "type": "text", "required": false, "options": { "min": null, "max": null, "pattern": "" } }),
    new SchemaField({ "system": false, "id": "sr_avgtime", "name": "avg_response_time_ms", "type": "number", "required": false, "options": { "min": null, "max": null, "noDecimal": false } }),
  ])
  dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)

  // Revert: remove solo_mode from games
  const games = dao.findCollectionByNameOrId("gjnnw9youlpqkez")
  games.schema.removeField("solo1mode1")
  dao.saveCollection(games)

  // Revert: delete solo_results collection
  try {
    const solo = dao.findCollectionByNameOrId("solo_results")
    dao.deleteCollection(solo)
  } catch (_) {}
})
