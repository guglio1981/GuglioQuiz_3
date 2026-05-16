/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection()
  collection.name = "user_question_history"
  collection.type = "base"
  collection.listRule = ""
  collection.viewRule = ""
  collection.createRule = ""
  collection.updateRule = ""
  collection.deleteRule = null
  collection.schema = new Schema([
    new SchemaField({
      "system": false, "id": "uqh_user", "name": "user",
      "type": "text", "required": false,
      "options": { "min": null, "max": null, "pattern": "" }
    }),
    new SchemaField({
      "system": false, "id": "uqh_hashes", "name": "hashes",
      "type": "json", "required": false,
      "options": { "maxSize": 2000000 }
    }),
  ])
  const dao = new Dao(db)
  dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  try {
    const col = dao.findCollectionByNameOrId("user_question_history")
    dao.deleteCollection(col)
  } catch (_) {}
})
