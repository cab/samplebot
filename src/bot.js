require('dotenv').config()
let fs = require('fs')
let urlParse = require('url')
let { Dropbox } = require('dropbox')
let path = require('path')
let ytdl = require('ytdl-core')
let ffmpeg = require('fluent-ffmpeg')
let sanitizeFilename = require('sanitize-filename')
let Discord = require('discord.js')
let parseArgs = require('minimist')
let sqlite3 = require('sqlite3')
let sqlite = require('sqlite')
let tempfile = require('tempfile')

let SAMPLE_PATH = '/samples'
let CHALLENGES_PATH = '/challenges'

function youtubeSampleSource(url) {
  return async (format) => {
    let info = await ytdl.getInfo(url)
    let filepath = tempfile(`.${format}`)
    await new Promise((resolve, reject) =>
      ffmpeg(
        ytdl(url, {
          filter: 'audioonly',
          quality: 'highestaudio',
        }),
      )
        .format(format)
        .on('error', (e) => reject(e))
        .on('end', () => resolve())
        .save(filepath),
    )
    let data = await fs.promises.readFile(filepath)
    return { data, title: info.videoDetails.title }
  }
}

async function addYoutubeSample(url, args, message, dropbox) {
  let allowedFormats = ['mp3', 'wav']
  let allowedHosts = [
    'youtube.com',
    'm.youtube.com',
    'youtu.be',
    'www.youtube.com',
    'music.youtube.com',
  ]
  let defaultFormat = 'wav'
  let format = args.format || defaultFormat

  if (!allowedFormats.includes(format)) {
    await message.reply(`invalid format, sorry`)
    return
  }

  let { hostname } = urlParse.parse(url)
  if (allowedHosts.includes(hostname)) {
    await message.react('👍')
    let link = await uploadSample(
      youtubeSampleSource(url),
      defaultFormat,
      dropbox,
    )
    return link
  } else {
    throw new Error(`url "${url}" is not supported`)
  }
}

async function uploadSample(source, format, dropbox) {
  let { title, data } = await source(format)
  let uploadPath = path
    .join(SAMPLE_PATH, `${sanitizeFilename(title)}.${format}`)
    .replace(/\\/g, '/')

  await dropbox.filesUpload({
    path: uploadPath,
    contents: data,
  })
  let link = await dropbox.sharingCreateSharedLink({
    path: uploadPath,
    short_url: true,
  })
  return link
}

async function getCurrentChallenge(db) {
  let actives = await db.all('select * from challenges where active = ?', true)
  if (actives.length > 0) {
    return actives[0]
  }
}

async function existingChallenge(db) {
  let currentChallenge = await getCurrentChallenge(db)
  return !!currentChallenge
}

async function endChallenge(db, id) {
  return db.run('update challenges set active = ? WHERE id = ?', false, id)
}

async function getSubmissions(db, challengeId) {
  return db.all('select * from submissions where challenge_id = ?', challengeId)
}

async function createChallenge(db, ownerId, sampleUrl) {
  if (await existingChallenge(db)) {
    return false
  }

  await db.run(
    'insert into challenges(owner_id, sample_url, active) VALUES(:ownerId, :sampleUrl, :active)',
    {
      ':active': true,
      ':ownerId': ownerId,
      ':sampleUrl': sampleUrl,
    },
  )
}

async function createSubmission(db, challengeId, ownerId, trackUrl) {
  await db.run(
    'insert into submissions(owner_id, challenge_id, track_url) VALUES(:ownerId, :challengeId, :trackUrl) on conflict (challenge_id, owner_id) do update set track_url = excluded.track_url',
    {
      ':ownerId': ownerId,
      ':challengeId': challengeId,
      ':trackUrl': trackUrl,
    },
  )
}

function listDropboxFiles(dropbox, path) {
  async function list(build, cursor) {
    let response
    if (cursor) {
      response = await dropbox.filesListFolderContinue({ cursor })
    } else {
      response = await dropbox.filesListFolder({ path })
    }
    let { entries, has_more: hasMore, cursor: newCursor } = response
    let allEntries = build.concat(entries)
    if (hasMore) {
      return list(allEntries, newCursor)
    } else {
      return allEntries
    }
  }
  return list([])
}

async function getRandomSample(dropbox) {
  try {
    let entries = await listDropboxFiles(dropbox, SAMPLE_PATH)
    let sample = entries[Math.floor(Math.random() * entries.length)]
    let link = await dropbox.sharingCreateSharedLink({
      path: sample.path_lower,
      short_url: true,
    })

    return link
  } catch (err) {
    console.error(`Failed to list files at '${SAMPLE_PATH}'`, err)
    throw err
  }
}

function setupDiscord(dropbox, db) {
  let client = new Discord.Client()
  client.commands = new Discord.Collection()
  let prefix = 'sb!'

  client.commands.set('help', {
    execute: async (message) => {
      let available = client.commands
        .keyArray()
        .map((k) => `\`${prefix}${k}\``)
        .join(', ')
      await message.reply(`available commands: ${available}`)
    },
  })

  client.commands.set('challenge', {
    execute: async (message) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (currentChallenge) {
        let owner = `<@${currentChallenge.owner_id}>`
        return message.reply(
          `${owner} is running a challenge. sample: ${currentChallenge.sample_url}`,
        )
      } else {
        return message.reply(
          'no current challenge. start one with `challenge.start <sample>`',
        )
      }
    },
  })

  client.commands.set('challenge.submissions', {
    execute: async (message) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (currentChallenge) {
        let submissions = await getSubmissions(db, currentChallenge.id)
        if (submissions.length === 0) {
          return message.reply('no submissions yet')
        }
        return message.reply(
          submissions.map((s) => `<@${s.owner_id}>: ${s.track_url}`).join('\n'),
        )
      } else {
        return message.reply(
          'no current challenge. start one by with `challenge.start <sample>`',
        )
      }
    },
  })

  client.commands.set('challenge.submit', {
    execute: async (message, args) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (!currentChallenge) {
        return message.reply(
          'no current challenge. start one by with `challenge.start <sample>`',
        )
      }

      if (args._.length === 0) {
        return message.react('❓')
      }

      let ownerId = message.author.id
      let trackUrl = args._[0]
      let challengeId = currentChallenge.id

      await createSubmission(db, challengeId, ownerId, trackUrl)
      await message.react('👍')
    },
  })

  client.commands.set('challenges', {
    execute: async (message) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: CHALLENGES_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  client.commands.set('challenge.end', {
    execute: async (message) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (!currentChallenge) {
        return message.reply('no current challenge')
      }

      let ownerId = currentChallenge.owner_id

      if (ownerId !== message.author.id) {
        let owner = `<@${currentChallenge.owner_id}>`
        return message.reply(`only ${owner} can end the challenge`)
      }

      await endChallenge(db, currentChallenge.id)
      let submissions = (await getSubmissions(db, currentChallenge.id))
        .map((s) => `<@${s.owner_id}>: ${s.track_url}`)
        .join('\n')
      return message.reply(`challenge ended. submissions:\n${submissions}`)
    },
  })

  client.commands.set('challenge.start', {
    execute: async (message, args) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (currentChallenge) {
        let owner = `<@${currentChallenge.owner_id}>`
        return message.reply(
          `${owner} is already running a challenge. find out more with \`challenge\``,
        )
      }

      let url = args._[0]
      try {
        let link = url
          ? await addYoutubeSample(url, args, message, dropbox)
          : await getRandomSample(dropbox)

        await createChallenge(db, message.author.id, link.url)
        await message.reply(`challenge started! sample: ${link.url}`)
      } catch (err) {
        console.error(`Failed to start a challenge: ${err}`)
        return message.react('❓')
      }
    },
  })

  client.commands.set('samples', {
    execute: async (message) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: SAMPLE_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  client.commands.set('samples.add', {
    execute: async (message, args) => {
      console.log('args', args)
      if (args._.length === 0) {
        await message.reply(`Failed to add a sample, missing URL`)
        return message.react('❓')
      }

      let url = args._[0]
      try {
        let link = await addYoutubeSample(url, args, message, dropbox)
        await message.reply(`done. ${link.url}`)
      } catch (err) {
        console.error(err)
        if (err.error) {
          await message.reply(
            `Failed to add a sample: \`\`\`${JSON.stringify(
              err.error,
              null,
              2,
            )}\`\`\``,
          )
        } else {
          await message.reply(`Failed to add a sample - ${err.toString()}`)
        }
        return message.react('❓')
      }
    },
  })

  client.commands.set('samples.random', {
    execute: async (message) => {
      try {
        await message.react('👍')
        let { url } = await getRandomSample(dropbox)
        await message.reply(`done. ${url}`)
      } catch (err) {
        return message.react('❓')
      }
    },
  })

  client.once('ready', () => {})

  client.on('message', (message) =>
    (async () => {
      if (message.author.bot) return
      let content = message.content.toLowerCase()
      let argv = content.split(/ +/)
      if (!argv[0].startsWith(prefix)) return
      argv[0] = argv[0].substr(prefix.length)
      let args = parseArgs(argv)
      if (args._.length === 0) return

      for (let i = args._.length; i >= 0; i--) {
        let command = args._.slice(0, i).join('.')
        if (client.commands.has(command)) {
          try {
            args._ = args._.slice(i)
            await client.commands.get(command).execute(message, args)
          } catch (error) {
            console.error(error)
            await message.reply(`that didn't work`)
          }
          break
        }
      }
    })(),
  )

  client.login(process.env.DISCORD_BOT_TOKEN)

  return client
}

async function run() {
  let db = await sqlite.open({
    filename: './db.sqlite3',
    driver: sqlite3.Database,
  })
  let dropbox = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    fetch: require('node-fetch'),
  })

  setupDiscord(dropbox, db)
}

// Only run the server when we aren't running tests.
if (process.env.NODE_ENV !== 'test') {
  run().catch((e) => console.error(e))
}

module.exports = {
  youtubeSampleSource,
  addYoutubeSample,
  getRandomSample,
}
