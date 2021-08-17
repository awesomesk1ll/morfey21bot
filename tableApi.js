const { google } = require('googleapis');
const { getAuthClient } = require('./googleAuth');

/**
* Получает данные из таблицы.
* @async
* @returns {Array<Array>} (матрица данных)
*/
const getApiClient = async () => {
    const authClient = await getAuthClient();
    const { spreadsheets: apiClient } = google.sheets( {
        version : 'v4',
        auth    : authClient,
    } );
 
    return apiClient;
};

/**
* Получает данные из таблицы.
* @param {object} apiClient - google spreadsheets обжект.
* @param {string} range - имя листа/диапазон.
* @async
* @returns {Array<Array>} (матрица данных)
*/
const getTableValues = async ( apiClient, range ) => {
    const { data } = await apiClient.values.get( {
        spreadsheetId   : process.env.SPREADSHEET_ID,
        range           : (range + '!A:B')
    } );

    return data.values;
};

/**
* Находит строку по совпадению в первой колонке.
* @param {Array<Array>} values - матрица с данными.
* @param {string} message - искомое сообщение.
* @returns {number} индекс найденной строки (или -1)
*/
const findRowIndex = ( values, message ) => {
    return values.findIndex((row) => row[0] === message);
};

/**
* Функция для выдергивания ответа из гуголь таблицы.
* Пытаетсяя найти строку с инфой и отправляет ответ.
* @param {object} ctx - контекст из телеграфа.
*/
const getTableInfo = async ( ctx ) => {
    const range = process.env.SHEET_NAME;
    const message = ctx.message.text;
    const apiClient = await getApiClient();
    const values = await getTableValues( apiClient, range );
    const rowIndex = findRowIndex( values, message );
    if ( rowIndex > -1 ) {
        const answer = values[rowIndex][1];
        ctx.reply(`Ответ: ${ answer }.`);
    } else {
        ctx.reply('Попробуй снова, указанное имя не найдено(');
    }
};

/**
* Добавляет данные в таблицу.
* @param {object} apiClient - google spreadsheets обжект.
* @param {object} options - объект добавления (контекст (юзер, id), пока хз).
* @async
* @returns {number} - статус операции (пост запрос, 200 - ОК)
*/
const addTableValue = async ( apiClient, options ) => {
    const { status } = await apiClient.values.append({
        spreadsheetId   : process.env.SPREADSHEET_ID,
        range           : (options.range + '!A:B'),
        valueInputOption: "USER_ENTERED",
        resource: {
            values: [
                [ (new Date()).toLocaleString(), options.message ]
            ]
        }
    });
    return status;
};

/**
* Обновляет данные в таблице.
* @param {object} apiClient - google spreadsheets обжект.
* @param {object} options - объект добавления (контекст (юзер, id), пока хз).
* @async
* @returns {number} - статус операции (пост запрос, 200 - ОК)
*/
const updateTableValue = async ( apiClient, options ) => {
    const { status } = await apiClient.values.update({
        spreadsheetId   : process.env.SPREADSHEET_ID,
        range           : options.range,
        valueInputOption: "USER_ENTERED",
        resource: {
            values: [
                [ options.key, options.payload ]
            ]
        }
    });
    return status;
};

/**
* Функция для обновления инфы в таблице.
* Пытается найти строку с инфой, отправляет ответ.
* @param {object} ctx - контекст из телеграфа.
*/
const updateTableInfo = async ( ctx ) => {
    let range = process.env.SHEET_NAME;
    const [ key, payload ] = ctx.message.text.split(" ");
    const apiClient = await getApiClient();
    const values = await getTableValues( apiClient, range );
    const rowIndex = findRowIndex( values, key );
    range += `!A${rowIndex + 1}:B${rowIndex + 1}`;

    console.log("range", range);

    const result = (rowIndex > -1) && await updateTableValue( apiClient, { ctx, key, payload, range } );
    if ( result >= 200 && result <= 202 ) {
        ctx.reply(`Обновили данные в строке ${rowIndex + 1}.`);
    } else {
        ctx.reply('Попробуй снова, указанное имя не найдено(');
    }
};

/**
* Функция для добавления инфы в таблицу.
* Пытаетсяя найти строку с инфой и отправляет ответ.
* @param {object} ctx - контекст из телеграфа.
*/
const addTableInfo = async ( ctx ) => {
    const range = process.env.SHEET_NAME;
    const message = ctx.message.text;
    const apiClient = await getApiClient();
    const result = await addTableValue( apiClient, { ctx, message, range } );
    if ( result >= 200 && result <= 202 ) {
        ctx.reply(`Инфа добавлена успешно.`);
    } else {
        ctx.reply(`Что-то пошло не так. Статус: ${result}`);
    }
};

module.exports = {
    getTableInfo,
    addTableInfo,
    updateTableInfo
};