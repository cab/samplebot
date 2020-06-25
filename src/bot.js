require('dotenv').config()
let { Dropbox } = require('dropbox')
let path = require('path')
let ytdl = require('ytdl-core')
let concatStream = require('concat-stream')
let ffmpeg = require('fluent-ffmpeg')
let sanitizeFilename = require('sanitize-filename')
let Discord = require('discord.js')
let parseArgs = require('minimist')
let sqlite3 = require('sqlite3')
let sqlite = require('sqlite')

let SAMPLE_PATH = '/samples'
let CHALLENGES_PATH = '/challenges'

function youtubeSampleSource(url) {
  return async (format) => {
    let info = await ytdl.getInfo(url)
    return new Promise((resolve, reject) => {
      ffmpeg(
        ytdl(url, {
          filter: (format) =>
            format.audioBitrate === 160 &&
            format.qualityLabel == null /* audio only */,
        }),
      )
        .format(format)
        .on('error', (e) => reject(e))
        .pipe(concatStream((data) => resolve({ title: info.title, data })))
    })
  }
}

async function uploadSample(source, format, dropbox) {
  let { title, data } = await source(format)
  let uploadPath = path.join(
    SAMPLE_PATH,
    `${sanitizeFilename(title)}.${format}`,
  )
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

async function getChallenge(db, id) {
  return db.one('select * from challenges where id = ?', id)
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
  if (!!(await existingChallenge(db))) {
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

function setupDiscord(dropbox, db) {
  console.log('setting up discord')
  let client = new Discord.Client()
  client.commands = new Discord.Collection()

  client.commands.set('help', {
    execute: async (message, args) => {
      let available = client.commands
        .keyArray()
        .map((k) => `\`!${k}\``)
        .join(', ')
      await message.reply(`available commands: ${available}`)
    },
  })

  client.commands.set('challenge', {
    execute: async (message, args) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (!!currentChallenge) {
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
    execute: async (message, args) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (!!currentChallenge) {
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
    execute: async (message, args) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: CHALLENGES_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  client.commands.set('challenge.end', {
    execute: async (message, args) => {
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
      if (!!currentChallenge) {
        let owner = `<@${currentChallenge.owner_id}>`
        return message.reply(
          `${owner} is already running a challenge. find out more with \`challenge\``,
        )
      }
      if (args._.length === 0) {
        return message.react('❓')
      }
      let url = args._[0]
      if (
        url.startsWith('https://youtube.com/') ||
        url.startsWith('https://www.youtube.com/')
      ) {
        await message.react('👍')
        let link = await uploadSample(youtubeSampleSource(url), 'wav', dropbox)

        await createChallenge(db, message.author.id, link.url)
        await message.reply(`challenge started! sample: ${link.url}`)
      } else {
        return message.react('❓')
      }
    },
  })

  client.commands.set('samples', {
    execute: async (message, args) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: SAMPLE_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  client.commands.set('samples.add', {
    execute: async (message, args) => {
      if (args._.length === 0) {
        return message.react('❓')
      }
      let url = args._[0]
      let allowedFormats = ['mp3', 'wav']
      let defaultFormat = 'wav'
      let format = args.format || defaultFormat
      if (!allowedFormats.includes(format)) {
        await message.reply(`invalid format, sorry`)
        return
      }
      if (
        url.startsWith('https://youtube.com/') ||
        url.startsWith('https://www.youtube.com/')
      ) {
        await message.react('👍')
        let link = await uploadSample(youtubeSampleSource(url), format, dropbox)
        await message.reply(`done. ${link.url}`)
      } else {
        return message.react('❓')
      }
    },
  })

  client.once('ready', () => {
    console.log('discord client ready')
  })

  client.on('message', (message) => {
    ;(async () => {
      console.log(
        'recv msg',
        'bot?',
        message.author.bot,
        'mentioned?',
        message.mentions.has(client.user),
      )
      if (message.author.bot) return
      if (!message.mentions.has(client.user)) return
      let argv = message.content.split(/ +/).slice(1)
      let args = parseArgs(argv)
      console.log('args', args)
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
    })()
  })

  client.login(process.env.DISCORD_BOT_TOKEN)

  return client
}

async function run() {
  console.log('starting')
  let db = await sqlite.open({
    filename: './db.sqlite3',
    driver: sqlite3.Database,
  })
  console.log('db ready')
  let dropbox = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    fetch: require('node-fetch'),
  })
  console.log('dropbox ready')
  setupDiscord(dropbox, db)
}

run().catch((e) => console.error(e))
