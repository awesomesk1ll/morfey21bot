const { GoogleSpreadsheet } = require('google-spreadsheet');
const { UNREGISTERED, WRONG } = require('./defs/roles');
const { DEFAULT, NICKNAME, PHONE } = require('./defs/input_modes');
const Queue = require('./utils/queue');

// Initialize the sheet - doc ID is the long id in the sheets URL
const g_sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
const SAVE_QUEUE_TIMER = +process.env.SAVE_QUEUE_TIMER || 1050;
let users_sheet;
let users;
let pool_sheet;
let pool;
let save_process_handle;

/**
* Обработчик очереди на сохранение.
*/
const users_save_queue_handler = () => {
    let index = Queue.shift();
    if (index != undefined) {
        users[index].save();
    }
}

/**
* Получает данные из таблицы и инициализирует состояние в памяти.
* @async
*/
const data_init = async () => {
    console.log('// table API inits');
    const private_key = process.env.GOOGLE_KEY.replace(/\\n/g, '\n');
    const client_email = process.env.GOOGLE_MAIL;
    await g_sheet.useServiceAccountAuth({ private_key, client_email });
    await g_sheet.loadInfo();
    users_sheet = g_sheet.sheetsByTitle[process.env.USERS_SHEET_NAME];
    pool_sheet = g_sheet.sheetsByTitle[process.env.POOL_SHEET_NAME];
    users = await getRows(users_sheet);
    console.log('// loaded users info');
    pool = await getRows(pool_sheet);
    console.log('// loaded pool info');

    save_process_handle = setInterval(users_save_queue_handler, SAVE_QUEUE_TIMER);
};

/**
* Код срабатывающий при программном прерывании. (например CTRL+C)
* @async
*/
process.on('SIGINT', async function() {
    console.log("Interrupt signal, trying to complete queue:", Queue.length());
    clearInterval(save_process_handle);
    await Queue.items.forEach(async (item) => {
        await users[item].save();
    });
    process.exit();
});

/**
* Получает данные из таблицы.
* @param {object} apiClient - google spreadsheets обжект.
* @param {string} range - имя листа/диапазон.
* @async
* @returns {Array<Array>} (матрица данных)
*/
const getRows = async ( sheet ) => {
    return await sheet.getRows();
};

/**
* Находит строку по совпадению в первой колонке.
* @param {Array<Array>} rows - матрица с данными.
* @param {string} key - ключ поиска.
* @param {string} value - значение поиска.
* @returns {number} индекс найденной строки (или -1)
*/
const findRowIndex = ( rows, key, value ) => {
    return rows.findIndex((row) => row[key] === value);
};

/**
* Меняет значение по ключу для пользователя.
* @param {number|string} user_id - матрица с данными.
* @param {string} key - ключ поиска.
* @param {string} value - значение поиска.
*/
const updateUserData = async ( user_id, key, value ) => {
    const index = findRowIndex(users, 'id', user_id + '');

    users[index][key] = value;

    if (key == 'phone') {
        users[index].input_mode = users[index].nick ? DEFAULT : NICKNAME;
    }

    if (key == 'nick') {
        users[index].input_mode = users[index].phone ? DEFAULT : PHONE;
        if (users.filter((item, i) => i != index).find((user) => user.nick === value)) {
            users[index].role = WRONG;
        }
    }

    if (key == 'ig' || key == 'status' || key == 'feedback') {
        users[index].input_mode = DEFAULT;
    }

    console.log('pushing to queue index', index);
    Queue.push(index);
};

/**
* Создает нового пользователя из контекста отправителя.
* @param {object} from - пользователь tg (ctx.message.from).
*/
const createUser = async ( from ) => {
    // console.log('ctx.msg.from', from);
    if (from['language_code']) delete from.language_code;
    const user = await users_sheet.addRow({ ...from, role: UNREGISTERED, input_mode: DEFAULT, privacy: '{"contact":true,"tg":true,"ig":true}' });
    users.push(user);
}

/**
* Находит пользователя из контекста отправителя (если не находит -> создает).
* @param {object} from - пользователь tg (ctx.message.from).
* @returns {object} пользователь из users
*/
const getUserInfo = async ( from ) => {
    const ID = from.id + '';    

    let rowIndex = findRowIndex( users, 'id', ID );

    if ( rowIndex == -1 ) {
        console.log('// creating user', from.id, from.first_name, from.last_name, from.username);
        await createUser(from);
        rowIndex = findRowIndex( users, 'id', ID );
    }

    return users[rowIndex];
};

/**
* Находит пользователя по нику (если не находит -> false).
* @param {string} nick - ник школы 21.
* @returns {object|false} пользователь из users или false
*/
const getUserInfoByNick = async ( nick ) => {
    let rowIndex = findRowIndex( users, 'nick', nick );
    console.log('nick', nick);
    console.log('rowIndex', rowIndex);

    return ( rowIndex >= 0 ) ? users[rowIndex] : false;
};

/**
* Находит пользователя по номеру телефона (если не находит -> false).
* @param {string} phone - номер телефона в формате 79993334444.
* @returns {object|false} пользователь из users или false
*/
const getUserInfoByPhone = async ( phone ) => {
    let rowIndex = findRowIndex( users, 'phone', phone );
    console.log('phone', phone);
    console.log('rowIndex', rowIndex);

    return ( rowIndex >= 0 ) ? users[rowIndex] : false;
};

/**
* Находит пользователя по юзернейму tg (если не находит -> false).
* @param {string} username - username телеги без \@.
* @returns {object|false} пользователь из users или false
*/
const getUserInfoByUsername = async ( username ) => {
    let rowIndex = findRowIndex( users, 'username', username );
    console.log('phone', username);
    console.log('rowIndex', rowIndex);

    return ( rowIndex >= 0 ) ? users[rowIndex] : false;
};

/**
* Находит пользователя по нику и удаляет (если не находит -> false).
* @param {string} nick - ник школы 21.
* @returns {object|false} пользователь из users или false
*/
const delUserInfoByNick = async ( nick ) => {
    let res;

    let rowIndex = findRowIndex( users, 'nick', nick );
    if (rowIndex >= 0) {
        await users[rowIndex].delete()
        users = users.filter((val, index) => index != rowIndex);
        res = true;
    } else {
        res = false;
    }
    
    return res;
};

/**
* Находит информацию с бассейна (если не находит -> false).
* @param {string} nick - ник школы 21.
* @returns {object|false} информация из pool или false
*/
const getPoolInfo = async ( nick ) => {
    let rowIndex = findRowIndex( pool, 'name', nick );

    return ( rowIndex >= 0 ) ? pool[rowIndex] : false;
};

module.exports = {
    data_init,
    getUserInfo,
    updateUserData,
    getPoolInfo,
    getUserInfoByNick,
    getUserInfoByPhone,
    getUserInfoByUsername,
    delUserInfoByNick,
};