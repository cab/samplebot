'use strict'

var dbm
var type
var seed

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate
  type = dbm.dataType
  seed = seedLink
}

exports.up = async function (db) {
  await db.createTable('challenges', {
    columns: {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      owner_id: { type: 'string', notNull: true },
      sample_url: { type: 'string', notNull: true },
      active: { type: 'boolean', notNull: true, defaultValue: false },
      created_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP'),
      },
    },
    ifNotExists: true,
  })
  await db.createTable('submissions', {
    columns: {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      challenge_id: { type: 'int', notNull: true },
      owner_id: { type: 'string', notNull: true },
      track_url: { type: 'string', notNull: true },
      created_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP'),
      },
    },
    ifNotExists: true,
  })
  await db.addIndex(
    'submissions',
    'index_on_challenge_id_and_owner_id',
    ['challenge_id', 'owner_id'],
    true,
  )
}

exports.down = async function (db) {
  await db.dropTable('challenges')
  await db.dropTable('submissions')
}

exports._meta = {
  version: 1,
}
