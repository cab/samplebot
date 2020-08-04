let { youtubeSampleSource } = require('../bot')
let { describe, it } = require('mocha')
let { expect } = require('chai')

const defaultFormat = 'mp3'

describe('#youtubeSampleSource', function () {
  this.timeout(45 * 1000) // Increase timeout cause this function is quite slow.

  it('should work for music.youtube.com links', function () {
    let sampleSource = youtubeSampleSource(
      'https://music.youtube.com/watch?v=NaMmX7OCyCA&feature=share',
    )

    return sampleSource(defaultFormat).then((output) => {
      expect(output).to.have.keys(['data', 'title'])
    })
  })

  it('should work for youtube.com links', function () {
    let sampleSource = youtubeSampleSource(
      'https://youtube.com/watch?v=NaMmX7OCyCA&feature=share',
    )

    return sampleSource(defaultFormat).then((output) => {
      expect(output).to.have.keys(['data', 'title'])
    })
  })
})
