const { Requester, Validator } = require('@chainlink/external-adapter')
require('dotenv').config()
const { verifyMessage } = require('@ethersproject/wallet')
const { isAddress } = require('@ethersproject/address')

// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === 'Error') return true
  return false
}

/** Library (Unit tested in monorepo)
 * https://github.com/GalloDaSballo/aave-chainlink-euro
*/
const fromTweetToSignature = (tweet) => {
  const text = tweet.data.text
  const foundSignature = /(0x[A-Fa-f0-9]{130})/.exec(text)
  if (!foundSignature[0]) {
    throw new Error('No Signature in Tweet')
  }
  return foundSignature[0]
}

/**
 * Given a signature and the message, returns the public address
 * @param token
 * @param message
 * @returns
 */
const getAddress = (message, token) => {
  const address = verifyMessage(message, token)
  return address
}

// Define custom parameters to be used by the adapter.
// Extra parameters can be stated in the extra object,
// with a Boolean value indicating whether or not they
// should be required.
const customParams = {
  tweetId: false
}

const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams)
  const jobRunID = validator.validated.id
  const tweetId = validator.validated.data.tweetId

  console.log('tweetId', tweetId)

  // This is where you would add method and headers
  // you can add method like GET or POST and add it to the config
  // The default is GET requests
  // method = 'get'
  // headers = 'headers.....'
  const config = {
    url: `https://api.twitter.com/2/tweets/${tweetId}?expansions=author_id`,
    headers: {
      Authorization: `Bearer ${process.env.TWITTER_API_BEARER_TOKEN}`
    }
  }

  Requester.request(config, customError)
    .then(response => {
      const tweet = response.data
      console.log('tweet', tweet)

      const signature = fromTweetToSignature(tweet)

      // Get user handle from tweet
      const handle = String(tweet.includes.users[0].username).toLowerCase()
      console.log('handle', handle)

      const address = getAddress(handle, signature)
      console.log('address', address)

      const verified = isAddress(address)
      console.log('verified', verified)

      response.data.result = handle // TODO MAKE IT WORK
      callback(response.status, Requester.success(jobRunID, response))
    })
    .catch(error => {
      callback(500, Requester.errored(jobRunID, error))
    })
}

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data)
  })
}

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data)
  })
}

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    })
  })
}

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest
