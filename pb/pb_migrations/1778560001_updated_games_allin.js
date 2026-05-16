/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gjnnw9youlpqkez")
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "allin1ena",
    "name": "allin_enabled",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("gjnnw9youlpqkez")
  collection.schema.removeField("allin1ena")
  return dao.saveCollection(collection)
})
