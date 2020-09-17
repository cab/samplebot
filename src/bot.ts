require('dotenv').config()
import * as fs from 'fs'
import { parse as parseUrl } from 'url'
import { Dropbox, files as dropboxFiles } from 'dropbox'
import * as path from 'path'
import ytdl from 'ytdl-core'
import ffmpeg from 'fluent-ffmpeg'
import sanitizeFilename from 'sanitize-filename'
import * as Discord from 'discord.js'
import parseArgs, { ParsedArgs } from 'minimist'
import sqlite3 from 'sqlite3'
import sqlite, { Database } from 'sqlite'
import tempfile from 'tempfile'
import { stringify } from 'querystring'
// import * as ytdlbase from 'youtube-dl'
import youtubedl, { Info } from 'youtube-dl'

let SAMPLE_PATH = '/samples'
let CHALLENGES_PATH = '/challenges'

type AudioFormat = 'wav' | 'mp3'

function youtubeSampleSource(url: string) {
  return async (format: AudioFormat) => {
    return youtubedl.getInfo(url, [], async (err: Error, videoInfo: Info) => {
      if (err) throw err

      let filepath = tempfile(`.${format}`)
      const args = ['--audio-quality 0', '-x']
      await new Promise((resolve, reject) =>
        youtubedl(url, args, { cwd: __dirname })
          .pipe(fs.createWriteStream(filepath))
          .on('error', (e: any) => reject(e))
          .on('complete', () => resolve()),
      )
      let data = await fs.promises.readFile(filepath)

      return { data, title: videoInfo.title }
    })
  }
}

export async function addYoutubeSample(
  url: string,
  args: { format: AudioFormat },
  message: Discord.Message,
  dropbox: Dropbox,
): ReturnType<typeof uploadSample> {
  let allowedFormats = ['mp3', 'wav']
  let allowedHosts = [
    'youtube.com',
    'youtu.be',
    'www.youtube.com',
    'music.youtube.com',
  ]
  let defaultFormat: AudioFormat = 'wav'
  let format = args.format || defaultFormat

  if (!allowedFormats.includes(format)) {
    await message.reply(`invalid format, sorry`)
    throw new Error(`invalid format ${format}`)
  }

  let { hostname } = parseUrl(url)
  if (hostname && allowedHosts.includes(hostname)) {
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

type Source = (fmt: AudioFormat) => Promise<{ title: string; data: any }>

async function uploadSample(
  source: Source,
  format: AudioFormat,
  dropbox: Dropbox,
) {
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

async function getCurrentChallenge(db: Database) {
  let actives = await db.all('select * from challenges where active = ?', true)
  if (actives.length > 0) {
    return actives[0]
  }
}

async function existingChallenge(db: Database) {
  let currentChallenge = await getCurrentChallenge(db)
  return !!currentChallenge
}

async function endChallenge(db: Database, id: string) {
  return db.run('update challenges set active = ? WHERE id = ?', false, id)
}

async function getSubmissions(db: Database, challengeId: string) {
  return db.all('select * from submissions where challenge_id = ?', challengeId)
}

async function createChallenge(
  db: Database,
  ownerId: string,
  sampleUrl: string,
) {
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

async function createSubmission(
  db: Database,
  challengeId: string,
  ownerId: string,
  trackUrl: string,
) {
  await db.run(
    'insert into submissions(owner_id, challenge_id, track_url) VALUES(:ownerId, :challengeId, :trackUrl) on conflict (challenge_id, owner_id) do update set track_url = excluded.track_url',
    {
      ':ownerId': ownerId,
      ':challengeId': challengeId,
      ':trackUrl': trackUrl,
    },
  )
}

type DropboxEntry = dropboxFiles.ListFolderResult['entries'][0]

function listDropboxFiles(
  dropbox: Dropbox,
  path: string,
): Promise<DropboxEntry[]> {
  async function list(
    build: DropboxEntry[],
    cursor: string | undefined,
  ): Promise<DropboxEntry[]> {
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
  return list([], undefined)
}

export async function getRandomSample(dropbox: Dropbox) {
  try {
    let entries = await listDropboxFiles(dropbox, SAMPLE_PATH)
    let sample = entries[Math.floor(Math.random() * entries.length)]
    let link = await dropbox.sharingCreateSharedLink({
      path: sample.path_lower!,
      short_url: true,
    })

    return link
  } catch (err) {
    console.error(`Failed to list files at '${SAMPLE_PATH}'`, err)
    throw err
  }
}

interface CommandDef {
  execute: (message: Discord.Message, args: ParsedArgs) => Promise<any>
}

function setupDiscord(dropbox: Dropbox, db: Database) {
  let client = new Discord.Client()
  let commands = new Discord.Collection<string, CommandDef>()
  let prefix = 'sb!'

  commands.set('help', {
    execute: async (message) => {
      let available = commands
        .keyArray()
        .map((k) => `\`${prefix}${k}\``)
        .join(', ')
      await message.reply(`available commands: ${available}`)
    },
  })

  commands.set('challenge', {
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

  commands.set('challenge.submissions', {
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

  commands.set('challenge.submit', {
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

  commands.set('challenges', {
    execute: async (message) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: CHALLENGES_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  commands.set('challenge.end', {
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

  commands.set('challenge.start', {
    execute: async (message, args) => {
      let currentChallenge = await getCurrentChallenge(db)
      if (currentChallenge) {
        let owner = `<@${currentChallenge.owner_id}>`
        return message.reply(
          `${owner} is already running a challenge. find out more with \`challenge\``,
        )
      }

      if (args._.length === 0) {
        return message.react('❓')
      }

      let url = args._[0]
      try {
        let link = await addYoutubeSample(
          url,
          { format: args.format as AudioFormat },
          message,
          dropbox,
        )

        await createChallenge(db, message.author.id, link.url)
        await message.reply(`challenge started! sample: ${link.url}`)
      } catch (err) {
        console.error(`Failed to start a challenge: ${err}`)
        return message.react('❓')
      }
    },
  })

  commands.set('samples', {
    execute: async (message) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: SAMPLE_PATH,
        short_url: true,
      })
      message.reply(link.url)
    },
  })

  commands.set('samples.add', {
    execute: async (message, args) => {
      if (args._.length === 0) {
        return message.react('❓')
      }

      let url = args._[0]
      try {
        let link = await addYoutubeSample(
          url,
          { format: args.format as AudioFormat },
          message,
          dropbox,
        )
        await message.reply(`done. ${link.url}`)
      } catch (err) {
        console.error(`Failed to add a sample: ${err}`)
        return message.react('❓')
      }
    },
  })

  commands.set('samples.random', {
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
      let argv = message.content.split(/ +/)
      if (!argv[0].startsWith(prefix)) return
      argv[0] = argv[0].substr(prefix.length)
      let args = parseArgs(argv)
      if (args._.length === 0) return

      for (let i = args._.length; i >= 0; i--) {
        let command = args._.slice(0, i).join('.')
        if (commands.has(command)) {
          try {
            args._ = args._.slice(i)
            let execCmd = commands.get(command)
            if (execCmd) {
              await execCmd.execute(message, args)
            }
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
