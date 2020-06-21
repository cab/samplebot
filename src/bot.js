require('dotenv').config()
let { Dropbox } = require('dropbox')
let path = require('path')
let ytdl = require('ytdl-core')
let concatStream = require('concat-stream')
let ffmpeg = require('fluent-ffmpeg')
let sanitizeFilename = require('sanitize-filename')
let Discord = require('discord.js')
let parseArgs = require('minimist')

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

function setupDiscord(dropbox) {
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

  client.commands.set('challenges', {
    execute: async (message, args) => {
      let link = await dropbox.sharingCreateSharedLink({
        path: CHALLENGES_PATH,
        short_url: true,
      })
      message.reply(link.url)
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

  let prefix = '!'

  client.once('ready', () => {})

  client.on('message', (message) => {
    ;(async () => {
      if (message.author.bot) return
      if (!message.mentions.has(client.user)) return
      let argv = message.content.split(/ +/).slice(1)
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
    })()
  })

  client.login(process.env.DISCORD_BOT_TOKEN)

  return client
}

function run() {
  let dropbox = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    fetch: require('node-fetch'),
  })

  setupDiscord(dropbox)
}

run()
