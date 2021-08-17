const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
* Создает клиента для аутентификации с помощью JWT
* в сервисах Google.
* @async
* @returns {Promise<Object>}  google.auth.JWT instance
*/
const getAuthClient = async () => {
    const private_key = process.env.GOOGLE_KEY.replace(/\\n/g, '\n');
    const client_email = process.env.GOOGLE_MAIL;

    const client = new google.auth.JWT(
        client_email,
        null,
        private_key,
        SCOPES,
        null,
    );

   return client;
};

module.exports = {
    getAuthClient,
};