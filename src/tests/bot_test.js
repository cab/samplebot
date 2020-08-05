let { addYoutubeSample } = require('../bot')
let { describe, it } = require('mocha')
let { expect } = require('chai')
let chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
let { Message } = require('discord.js')
let sinon = require('sinon')
let { Dropbox } = require('dropbox')
const { assert } = require('@sinonjs/referee')

chai.use(chaiAsPromised)

describe('#addYoutubeSample', function () {
  this.timeout(15 * 1000)
  it('should throw an error when invalid url provided', async function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return await expect(
      addYoutubeSample(
        'invalid',
        {
          format: 'mp3',
        },
        messageStub,
        dropbox,
      ),
    ).to.be.rejectedWith(Error)
  })

  it('should work for music.youtube.com links', function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://music.youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      messageStub,
      dropbox,
    ).then((link) => {
      expect(link).to.equal('example-url')
      assert.isTrue(messageStub.react.calledWith('👍'))
      expect(dropbox)
    })
  })

  it('should work for youtube.com links', function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      messageStub,
      dropbox,
    ).then((link) => {
      expect(link).to.equal('example-url')
      assert.isTrue(messageStub.react.calledWith('👍'))
      expect(dropbox)
    })
  })

  it('should work with a song with the highest quality', function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://music.youtube.com/watch?v=rW9VsxK2HPE',
      {
        format: 'mp3',
      },
      messageStub,
      dropbox,
    ).then((link) => {
      expect(link).to.equal('example-url')
      assert.isTrue(dropbox.filesUpload.called)
      assert.isTrue(messageStub.react.calledWith('👍'))
      expect(dropbox)
    })
  })

  it('should work for www.youtube.com links', function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://www.youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      messageStub,
      dropbox,
    ).then((link) => {
      expect(link).to.equal('example-url')
      assert.isTrue(dropbox.filesUpload.called)
      assert.isTrue(messageStub.react.calledWith('👍'))
      expect(dropbox)
    })
  })

  it('should work for youtu.be links', function () {
    let dropbox = new Dropbox({
      fetch: require('node-fetch'),
    })
    sinon.stub(dropbox, 'filesUpload').returns('')
    sinon.stub(dropbox, 'sharingCreateSharedLink').returns('example-url')

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://youtu.be/NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      messageStub,
      dropbox,
    ).then((link) => {
      expect(link).to.equal('example-url')
      assert.isTrue(messageStub.react.calledWith('👍'))
      expect(dropbox)
    })
  })
})
