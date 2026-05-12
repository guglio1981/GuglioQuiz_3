/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ztrmc137lx57tms")

  // remove
  collection.schema.removeField("7dd3gnda")

  // remove
  collection.schema.removeField("7345oxc0")

  // remove
  collection.schema.removeField("d3yvkyyq")

  // remove
  collection.schema.removeField("c1nrxrgh")

  // remove
  collection.schema.removeField("wwcgzgnt")

  // remove
  collection.schema.removeField("sp4tjwc2")

  // remove
  collection.schema.removeField("vo4k9aez")

  // remove
  collection.schema.removeField("ln80st1s")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "akpmn6ar",
    "name": "question_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "rexqmhf7",
    "name": "player_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "uupbkkq2",
    "name": "answer",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xdfzowy8",
    "name": "is_abstention",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xd6ehudi",
    "name": "response_time_ms",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pdpqvz8y",
    "name": "is_correct",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "n0amukkf",
    "name": "points_earned",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "9kazzq1c",
    "name": "points_processed",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ztrmc137lx57tms")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "7dd3gnda",
    "name": "question_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "7345oxc0",
    "name": "player_id",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "d3yvkyyq",
    "name": "answer",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "c1nrxrgh",
    "name": "is_abstention",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wwcgzgnt",
    "name": "response_time_ms",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "sp4tjwc2",
    "name": "is_correct",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vo4k9aez",
    "name": "points_earned",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ln80st1s",
    "name": "points_processed",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // remove
  collection.schema.removeField("akpmn6ar")

  // remove
  collection.schema.removeField("rexqmhf7")

  // remove
  collection.schema.removeField("uupbkkq2")

  // remove
  collection.schema.removeField("xdfzowy8")

  // remove
  collection.schema.removeField("xd6ehudi")

  // remove
  collection.schema.removeField("pdpqvz8y")

  // remove
  collection.schema.removeField("n0amukkf")

  // remove
  collection.schema.removeField("9kazzq1c")

  return dao.saveCollection(collection)
})
