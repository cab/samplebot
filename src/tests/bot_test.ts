import { addYoutubeSample, getRandomSample } from '../bot'
import { describe, it } from 'mocha'
import chai, { expect } from 'chai'
import { Message } from 'discord.js'
import sinon from 'sinon'
import { Dropbox, sharing } from 'dropbox'
import fetch from 'node-fetch'

chai.use(require('chai-as-promised'))

let sharedLink: sharing.PathLinkMetadata = {
  path: 'example-url',
  url: '',
  visibility: { '.tag': 'public' },
}

let uploaded = {} as any

describe('#addYoutubeSample', function () {
  this.timeout(15 * 1000)
  it('should throw an error when invalid url provided', async function () {
    let dropbox = new Dropbox({ fetch })
    sinon.stub(dropbox, 'filesUpload').returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return await expect(
      addYoutubeSample(
        'invalid',
        {
          format: 'mp3',
        },
        (messageStub as unknown) as Message,
        dropbox,
      ),
    ).to.be.rejectedWith(Error)
  })

  it('should work for music.youtube.com links', function () {
    let dropbox = new Dropbox({ fetch })
    sinon.stub(dropbox, 'filesUpload').returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://music.youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      (messageStub as unknown) as Message,
      dropbox,
    ).then((link) => {
      expect(link.path).to.equal('example-url')
      expect(messageStub.react.calledWith('👍')).to.eq(true)
      expect(dropbox)
    })
  })

  it('should work for youtube.com links', function () {
    let dropbox = new Dropbox({ fetch })
    sinon.stub(dropbox, 'filesUpload').returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      (messageStub as unknown) as Message,
      dropbox,
    ).then((link) => {
      expect(link.path).to.equal('example-url')
      expect(messageStub.react.calledWith('👍')).to.eq(true)
      expect(dropbox)
    })
  })

  it('should work with a song with the highest quality', function () {
    let dropbox = new Dropbox({ fetch })
    let uploadStub = sinon
      .stub(dropbox, 'filesUpload')
      .returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://music.youtube.com/watch?v=rW9VsxK2HPE',
      {
        format: 'mp3',
      },
      (messageStub as unknown) as Message,
      dropbox,
    ).then((link) => {
      expect(link.path).to.equal('example-url')
      expect(uploadStub.called).to.eq(true)
      expect(messageStub.react.calledWith('👍')).to.eq(true)
      expect(dropbox)
    })
  })

  it('should work for www.youtube.com links', function () {
    let dropbox = new Dropbox({ fetch })
    let uploadStub = sinon
      .stub(dropbox, 'filesUpload')
      .returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://www.youtube.com/watch?v=NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      (messageStub as unknown) as Message,
      dropbox,
    ).then((link) => {
      expect(link.path).to.equal('example-url')
      expect(uploadStub.called).to.eq(true)
      expect(messageStub.react.calledWith('👍')).to.eq(true)
      expect(dropbox)
    })
  })

  it('should work for youtu.be links', function () {
    let dropbox = new Dropbox({ fetch })
    sinon.stub(dropbox, 'filesUpload').returns(Promise.resolve(uploaded))
    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    let messageStub = sinon.createStubInstance(Message)

    return addYoutubeSample(
      'https://youtu.be/NaMmX7OCyCA&feature=share',
      {
        format: 'mp3',
      },
      (messageStub as unknown) as Message,
      dropbox,
    ).then((link) => {
      expect(link.path).to.equal('example-url')
      expect(messageStub.react.calledWith('👍')).to.eq(true)
      expect(dropbox)
    })
  })
})

describe('#getRandomSample', () => {
  it('should get a random link from dropbox', () => {
    const dropbox = new Dropbox({ fetch })
    sinon.stub(dropbox, 'filesListFolder').returns(
      Promise.resolve({
        cursor: '',
        has_more: false,
        entries: [
          {
            path_lower: '/samples/sample1.mp3',
          } as any,
          {
            path_lower: '/samples/sample2.mp3',
          } as any,
          {
            path_lower: '/samples/sample3.mp3',
          } as any,
        ],
      }),
    )

    sinon
      .stub(dropbox, 'sharingCreateSharedLink')
      .returns(Promise.resolve(sharedLink))

    return getRandomSample(dropbox).then((link) => {
      expect(link.path).to.eq('example-url')
    })
  })
})
