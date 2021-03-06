'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getHexFromBN = getHexFromBN;
exports.encryptECIES = encryptECIES;
exports.decryptECIES = decryptECIES;

var _elliptic = require('elliptic');

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ecurve = new _elliptic.ec('secp256k1');

function aes256CbcEncrypt(iv, key, plaintext) {
  var cipher = _crypto2.default.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function aes256CbcDecrypt(iv, key, ciphertext) {
  var cipher = _crypto2.default.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]);
}

function hmacSha256(key, content) {
  return _crypto2.default.createHmac('sha256', key).update(content).digest();
}

function equalConstTime(b1, b2) {
  if (b1.length !== b2.length) {
    return false;
  }
  var res = 0;
  for (var i = 0; i < b1.length; i++) {
    res |= b1[i] ^ b2[i]; // jshint ignore:line
  }
  return res === 0;
}

function sharedSecretToKeys(sharedSecret) {
  // generate mac and encryption key from shared secret
  var hashedSecret = _crypto2.default.createHash('sha512').update(sharedSecret).digest();
  return { encryptionKey: hashedSecret.slice(0, 32),
    hmacKey: hashedSecret.slice(32) };
}

function getHexFromBN(bnInput) {
  var hexOut = bnInput.toString('hex');

  if (hexOut.length === 64) {
    return hexOut;
  } else if (hexOut.length < 64) {
    // pad with leading zeros
    // the padStart function would require node 9
    var padding = '0'.repeat(64 - hexOut.length);
    return '' + padding + hexOut;
  } else {
    throw new Error('Generated a > 32-byte BN for encryption. Failing.');
  }
}

/**
 * Encrypt content to elliptic curve publicKey using ECIES
 * @private
 * @param {String} publicKey - secp256k1 public key hex string
 * @param {String | Buffer} content - content to encrypt
 * @return {Object} Object containing (hex encoded):
 *  iv (initialization vector), cipherText (cipher text),
 *  mac (message authentication code), ephemeral public key
 *  wasString (boolean indicating with or not to return a buffer or string on decrypt)
 */
function encryptECIES(publicKey, content) {
  var isString = typeof content === 'string';
  var plainText = new Buffer(content); // always copy to buffer

  var ecPK = ecurve.keyFromPublic(publicKey, 'hex').getPublic();
  var ephemeralSK = ecurve.genKeyPair();
  var ephemeralPK = ephemeralSK.getPublic();
  var sharedSecret = ephemeralSK.derive(ecPK);

  var sharedSecretHex = getHexFromBN(sharedSecret);

  var sharedKeys = sharedSecretToKeys(new Buffer(sharedSecretHex, 'hex'));

  var initializationVector = _crypto2.default.randomBytes(16);

  var cipherText = aes256CbcEncrypt(initializationVector, sharedKeys.encryptionKey, plainText);

  var macData = Buffer.concat([initializationVector, new Buffer(ephemeralPK.encodeCompressed()), cipherText]);
  var mac = hmacSha256(sharedKeys.hmacKey, macData);

  return { iv: initializationVector.toString('hex'),
    ephemeralPK: ephemeralPK.encodeCompressed('hex'),
    cipherText: cipherText.toString('hex'),
    mac: mac.toString('hex'),
    wasString: isString };
}

/**
 * Decrypt content encrypted using ECIES
 * @private
 * @param {String} privateKey - secp256k1 private key hex string
 * @param {Object} cipherObject - object to decrypt, should contain:
 *  iv (initialization vector), cipherText (cipher text),
 *  mac (message authentication code), ephemeralPublicKey
 *  wasString (boolean indicating with or not to return a buffer or string on decrypt)
 * @return {Buffer} plaintext, or false if error
 */
function decryptECIES(privateKey, cipherObject) {
  var ecSK = ecurve.keyFromPrivate(privateKey, 'hex');
  var ephemeralPK = ecurve.keyFromPublic(cipherObject.ephemeralPK, 'hex').getPublic();
  var sharedSecret = ecSK.derive(ephemeralPK);
  var sharedSecretBuffer = new Buffer(getHexFromBN(sharedSecret), 'hex');

  var sharedKeys = sharedSecretToKeys(sharedSecretBuffer);

  var ivBuffer = new Buffer(cipherObject.iv, 'hex');
  var cipherTextBuffer = new Buffer(cipherObject.cipherText, 'hex');

  var macData = Buffer.concat([ivBuffer, new Buffer(ephemeralPK.encodeCompressed()), cipherTextBuffer]);
  var actualMac = hmacSha256(sharedKeys.hmacKey, macData);
  var expectedMac = new Buffer(cipherObject.mac, 'hex');
  if (!equalConstTime(expectedMac, actualMac)) {
    throw new Error('Decryption failed: failure in MAC check');
  }
  var plainText = aes256CbcDecrypt(ivBuffer, sharedKeys.encryptionKey, cipherTextBuffer);

  if (cipherObject.wasString) {
    return plainText.toString();
  } else {
    return plainText;
  }
}