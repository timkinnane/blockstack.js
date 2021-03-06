'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lookupProfile = lookupProfile;

var _profileZoneFiles = require('./profileZoneFiles');

/**
 * Look up a user profile by blockstack ID
 *
 * @param {string} username The Blockstack ID of the profile to look up
 * @param {string} [zoneFileLookupURL=http://localhost:6270/v1/names/] The URL
 * to use for zonefile lookup 
 * @returns {Promise} that resolves to a profile object
 */
function lookupProfile(username) {
  var zoneFileLookupURL = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'http://localhost:6270/v1/names/';

  return new Promise(function (resolve, reject) {
    if (!username) {
      reject();
    }
    var url = zoneFileLookupURL.replace(/\/$/, '') + '/' + username;
    try {
      fetch(url).then(function (response) {
        return response.text();
      }).then(function (responseText) {
        return JSON.parse(responseText);
      }).then(function (responseJSON) {
        if (responseJSON.hasOwnProperty('zonefile') && responseJSON.hasOwnProperty('address')) {
          resolve((0, _profileZoneFiles.resolveZoneFileToProfile)(responseJSON.zonefile, responseJSON.address));
        } else {
          reject();
        }
      }).catch(function (e) {
        reject(e);
      });
    } catch (e) {
      reject(e);
    }
  });
}