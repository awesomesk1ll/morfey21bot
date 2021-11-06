const { GoogleSpreadsheet } = require('google-spreadsheet');
const { UNREGISTERED, WRONG } = require('./defs/roles');
const { DEFAULT, NICKNAME, PHONE } = require('./defs/input_modes');
const Queue = require('./utils/queue');
const { CLUSTERS: CAMPUS } = require('./utils/mapformat');
const { send, mapping } = require('./utils/gform');

// Initialize the sheet - doc ID is the long id in the sheets URL
const g_sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
const SAVE_QUEUE_TIMER = +process.env.SAVE_QUEUE_TIMER || 1050;
const MAP_UPDATE_TIMER = +process.env.MAP_UPDATE_TIMER || 61000;
const GFORM_URL = process.env.GFORM_URL || '';
const BOT_MORFEY = 0, MAP_PARSER = 1;
let users_sheet, users;
let pool_sheet, pool;
let map_sheet, map;
let info_sheet, info;
let save_process_handle;
let map_update_process_handle;

if (!process.env.SPREADSHEET_ID || !process.env.GOOGLE_KEY || !process.env.GOOGLE_MAIL || !process.env.USERS_SHEET_NAME || !process.env.POOL_SHEET_NAME || !process.env.MAP_SHEET_NAME || !process.env.INFO_SHEET_NAME) {
    console.error('Please setup google tables .env variables.');
    process.exit();
}

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
* Обновляет данные с карты.
*/
const map_update_handler = async () => {
    clearTimeout(map_update_process_handle);
    const tmp = await getRows(info_sheet);
    if (tmp && Array.isArray(tmp) && (tmp[MAP_PARSER].status === 'ok')) {
        info = tmp;
        map = await getRows(map_sheet, true, true);
        // console.log('campus', CAMPUS);
        map_update_process_handle = setTimeout(map_update_handler, MAP_UPDATE_TIMER);
    } else {
        info[MAP_PARSER].status = 'fail';
        console.log('FAILED', tmp);
    }
}

/**
* Получает данные из таблиц и инициализирует состояние в памяти.
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
    map_sheet = g_sheet.sheetsByTitle[process.env.MAP_SHEET_NAME];
    users = await getRows(users_sheet);
    console.log('// loaded users info');
    pool = await getRows(pool_sheet);
    console.log('// loaded pool info');
    map = await getRows(map_sheet, true, true);
    console.log('// loaded map info');
    info_sheet = g_sheet.sheetsByTitle[process.env.INFO_SHEET_NAME];
    info = await getRows(info_sheet, true);
    console.log('// loaded services info');
    info[BOT_MORFEY].status = 'ok';
    info[BOT_MORFEY].update = (new Date()).getTime();
    info[BOT_MORFEY].save();

    save_process_handle = setInterval(users_save_queue_handler, SAVE_QUEUE_TIMER);
    map_update_process_handle = setTimeout(map_update_handler, MAP_UPDATE_TIMER);
};

/**
* Код срабатывающий при программном прерывании. (например CTRL+C)
* @async
*/
process.on('SIGINT', async function() {
    console.log("Interrupt signal, trying to complete queue:", Queue.length());
    clearInterval(save_process_handle);
    info[BOT_MORFEY].status = 'fail';
    info[BOT_MORFEY].changed = (new Date()).getTime();
    info[BOT_MORFEY].save();
    await Queue.items.forEach(async (item) => {
        await users[item].save();
    });
    process.exit();
});

/**
* Получает данные из таблицы.
* @param {object} sheet - google spreadsheets обжект.
* @param {boolean} parseHistory - необходимость парсить .history.
* @async
* @returns {Array<Array>} (матрица данных)
*/
const getRows = async ( sheet, parseHistory, campus ) => {
    const rows = await sheet.getRows();
    rows.forEach((row) => {
        if (parseHistory) {
            row._history = row.history ? JSON.parse(row.history) : [];
        }
        if (campus && row.place) {
            CAMPUS[row.place.slice(0, 2)]._students.push({
                nick: row.nick,
                level: row.level,
                exp: row.exp,
                seat: row.place,
                changed: row.changed,
                last_uptime: row.last_uptime,
            });
        }        
    });
    if (campus) {
        const metrics = { all: 0 };
        for (cluster in CAMPUS) {
            let exp = 0;
            CAMPUS[cluster]._students.forEach((stud) => { exp += +stud.exp; });
            CAMPUS[cluster].students = CAMPUS[cluster]._students;
            CAMPUS[cluster]._students = [];
            CAMPUS[cluster].free = CAMPUS[cluster].capacity - CAMPUS[cluster].students.length;
            CAMPUS[cluster].avg_exp = CAMPUS[cluster].students.length ? Math.floor(exp / CAMPUS[cluster].students.length) : 0;
            metrics[cluster] = CAMPUS[cluster].students.length || 0;
            metrics.all += metrics[cluster];
        }
        if (GFORM_URL) {
            send(GFORM_URL, metrics, mapping);
        }
    }
    
    return rows;
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

/**
* Находит информацию по карте (если не находит -> false).
* @param {string} nick - ник школы 21.
* @returns {object|false} информация из pool или false
*/
const getMapInfo = async ( nick ) => {
    let rowIndex = findRowIndex( map, 'nick', nick );

    const status = (info[MAP_PARSER].status === 'ok');
    const updated = info[MAP_PARSER].update ? +info[MAP_PARSER].update : false;

    // console.log('asdasd', status, updated);

    return ( rowIndex >= 0 ) ? { user: map[rowIndex], status, updated } : false;
};

module.exports = {
    data_init,
    getUserInfo,
    updateUserData,
    getPoolInfo,
    getMapInfo,
    getUserInfoByNick,
    getUserInfoByPhone,
    getUserInfoByUsername,
    delUserInfoByNick,
};