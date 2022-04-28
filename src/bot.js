require('dotenv').config();
const { Telegraf } = require('telegraf');
const { data_init, getUserInfo, updateUserData, getPoolInfo, getMapInfo, getUserInfoByNick, getUserInfoByPhone, getUserInfoByUsername, delUserInfoByNick } = require('./table_api');
const { proof_keyboard, registration_keyboard, privacy_keyboard } = require('./inline_keyboards');
const { BANNED, UNREGISTERED, WRONG, REGISTERED, CONFIRMED, MODERATOR, ADMIN, OWNER } = require('./defs/roles');
const { DEFAULT, NICKNAME, PHONE, IG, STATUS, FEEDBACK } = require('./defs/input_modes');
const recognize = require('./utils/recognize');
const { formatMapData, formatMapHistory, formatClustersData } = require('./utils/mapformat'); // mapFormat
const changelog = require('./defs/changelog');

if (!process.env.OLD_MAIN || !process.env.NEW_MAIN || !process.env.NICKNAMES || !process.env.BOT_TOKEN) {
    console.error('Please setup bot .env variables.');
    process.exit();
}

const MODERATOR_IDS = process.env.MODERATORS.split(" ").map(id => +id);
const MAP_HISTORY_LENGTH = +process.env.MAP_HISTORY_LENGTH || 15;
const NICKNAMES = Object.fromEntries(process.env.NICKNAMES.split(' ').map((name) => [name, true]));
const PEERS = Object.fromEntries([...process.env.OLD_MAIN.split(' '), ...process.env.NEW_MAIN.split(' ')].map((name) => [name, true]));
const bot = new Telegraf(process.env.BOT_TOKEN);

/**
* Инициализирует данные (в table_api.js) и затем навешивает слушатели телеграфа.
*/
const bot_init = async () => {
    await data_init();

    bot.help((ctx) => user_handler(ctx, async (ctx) => {
        console.log('/help', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (not_in(+ctx.user.role, [BANNED, WRONG])) {
            ctx.reply('У бота можно узнать информацию о человеке, для этого достаточно написать его ник.\n'
                + 'Также имеется команда для того что-бы посмотреть свои результаты прохождения бассейна.\n\n'
                + (+ctx.user.role < REGISTERED ? 'Основной функционал доступен после регистрации. ' : '')
                + 'Список доступных команд /cmdlist');
        }
    }));

    bot.start((ctx) => user_handler(ctx, (ctx) => {
        console.log('/start', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        bot.telegram.setMyCommands(cmds());
        if (+ctx.user.role == UNREGISTERED) {
            ctx.reply('Для использования бота необходимо пройти регистрацию.\n\nДля продолжения жми одну из кнопок под сообщением.', registration_keyboard(ctx.user));
        } else if (not_in(+ctx.user.role, [BANNED, WRONG])) {
            ctx.reply('Список доступных команд - /cmdlist\nПоддержка - @awesomesk1ll');
        }
    }));

    bot.action(/.*/, (ctx) => user_handler(ctx, async (ctx) => {
        const [ action, value, value2 ] = ctx.update.callback_query.data.split(':');
        console.log('/action', action, ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        let answer = 'Теперь это не актуально.';

        if (action && action === 'registration' && +ctx.user.role === UNREGISTERED) {
            await updateUserData(ctx.user.id, 'input_mode', (value === 'phone') ? PHONE : NICKNAME);
            answer = (value === 'phone') ? 'Теперь отправь свой контакт.' : 'Теперь напиши свой ник или почту Школы 21.';
            bot.telegram.editMessageReplyMarkup(ctx.user.id, ctx.update.callback_query.message.message_id, false).then(() => {
                if (value === 'phone') {
                    ctx.reply(answer, { reply_markup: { keyboard: [[{text: '📲 Отправить мой контакт', request_contact: true}]] } });
                } else {
                    ctx.reply(answer);
                }
            });
        }

        if (action && action === 'proof' && (+ctx.user.role === ADMIN || +ctx.user.id === MODERATOR_IDS[0] )) {
            if (value) {
                answer = `Регистрация ${ value2 } подтверждена. `;
                const user = await getUserInfoByNick(value2);
                await updateUserData(user.id, 'role', (MODERATOR_IDS[0] === +user.id) ? OWNER : CONFIRMED);
                bot.telegram.sendMessage(user.id, 'Твоя регистрация прошла модерацию 👍\nСписок доступных команд - /cmdlist').then(() => {
                    answer += '(доставлено)';
                }).catch((err) => {
                    console.log('ошибка доставки', err, `ник: ${ value2 }, юзер:`, user);
                    answer += '(ошибка)';
                });
            } else {
                answer = `Пруф для ${ value2 } отклонён.`;
            }
            bot.telegram.editMessageReplyMarkup(ctx.user.id, ctx.update.callback_query.message.message_id, false).then(() => {
                ctx.reply(answer);
            });
        }

        if (action && action === 'privacy' && +ctx.user.role >= REGISTERED) {
            let privacy = { contact: +value2[0], tg: +value2[1], ig: +value2[2] };

            if (value === 'tg') {
                if (privacy.contact) {
                    privacy = { contact: false, tg: true, ig: !!privacy.ig };
                } else if (privacy.tg) {
                    privacy = { contact: false, tg: false, ig: !!privacy.ig };
                } else {
                    privacy = { contact: true, tg: false, ig: !!privacy.ig };
                }
                await updateUserData(ctx.user.id, 'privacy', JSON.stringify(privacy));
            } else if (value === 'ig') {
                privacy = { contact: !!privacy.contact, tg: !!privacy.tg, ig: !privacy.ig}
                await updateUserData(ctx.user.id, 'privacy', JSON.stringify(privacy));
            }
            
            if (value === 'close') {
                ctx.editMessageText(`Настройки приватности:\nTG: ${ 
                    (privacy.contact && 'Будет показан контакт (всё)') || (privacy.tg && 'Будет показан только ник') || 'Ничего не отображается' 
                }\nIG: Будет ${ privacy.ig ? 'показан' : 'скрыт' }`);
            } else {
                ctx.editMessageReplyMarkup(privacy_keyboard(privacy, ctx.user.ig).reply_markup);
            }

            answer = (value === 'close') ? 'Ок.' : 'Настройки приватности изменены.'
        }

        return ctx.answerCbQuery(answer);
    }));

    bot.on('contact', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/contact', ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role, ctx.update.message.contact.user_id, ctx.update.message.contact.phone_number);
        if (+ctx.user.role === UNREGISTERED && +ctx.user.input_mode === PHONE) {
            if (+ctx.user.id === ctx.update.message.contact.user_id) {
                await updateUserData(ctx.update.message.from.id, 'phone', ctx.update.message.contact.phone_number);
                ctx.reply('Контакт успешно установлен.', { reply_markup: { remove_keyboard: true } }).then(async () => {
                    if (!ctx.user.nick) {
                        ctx.reply('Теперь напиши свой ник или почту Школы 21.');
                    } else {
                        await reg_handler(ctx);
                    }
                });
            } else {
                ctx.reply('Неверный контакт. Попробуй ещё раз.');
            }
        } else if (+ctx.user.role >= REGISTERED && +ctx.user.input_mode === DEFAULT) {
            found = await getUserInfoByPhone(recognize(ctx.update.message.contact.phone_number)?.value);
            if (found) {
                let answer = '';
                const mapInfo = await getMapInfo(found?.nick || 'not_found');
                const privacy = JSON.parse(ctx.user.privacy);
                if (privacy.tg || found.status) {
                    answer += (found.nick ? found.nick : '')
                        + ((privacy.tg && found.username) ? ` (@${ found.username })` : '')
                        + (found.status ? `: ${ found.status }` : '');
                }
                if (privacy.contact && found.phone) {
                    if (found.username) {
                        answer += `\nИмя: ${ found.first_name || '' } ${ found.last_name || '' }\nНомер: +${ found.phone }`;
                    } else {
                        await bot.telegram
                        .sendContact(ctx.update.message.from.id, found.phone, `${found.first_name} ${found.last_name}${found.nick ? (' (' + found.nick + ')') : ''}`)
                        .catch((err) => {
                            answer += `\nИмя: ${ found.first_name || '' } ${ found.last_name || '' }\nНомер: +${ found.phone }`;
                            console.log('TG API unavailable for', err.response.parameters.retry_after);
                        });
                    }

                }
                if (privacy.ig && found.ig) {
                    answer += `\nIG: https://www.instagram.com/${ found.ig }/`;
                }
                if (mapInfo) {
                    if (!mapInfo.status) {
                        bot.telegram.sendMessage(MODERATOR_IDS[0], 'Сломался парсер карты, @awesomesk1ll');
                    }
                    answer += `\n\n` + formatMapData(mapInfo).format;
                }
                ctx.reply(answer || `Доступная для отображения информация по ${ input.value } отсутствует.`);
            } else {
                await ctx.reply(`Доступная для отображения информация по ${ ctx.update.message.contact.phone_number } отсутствует.`);
            }
        }
    }));

    bot.command('support', (ctx) => user_handler(ctx, async (ctx) => {
        if (not_in(+ctx.user.status, [BANNED, WRONG])) {
            ctx.reply('По любым проблемам с ботом пиши @awesomesk1ll');
        }
    }));
    
    bot.command('cmdlist', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/cmdlist', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (not_in(+ctx.user.status, [BANNED, WRONG])) {
            const answer = 'Список доступных команд:\n' + cmds(+ctx.user.role).map((cmd) => `/${ cmd.command } - ${ cmd.description }`).join('\n');
            ctx.reply(answer);
        }
    }));

    bot.command('changelog', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/changelog', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            const answer = `История изменений: \n\n${
                                changelog
                                    .slice(0, 3)
                                    .map(note => `Версия: ${ note.version } от ${ note.date }\n${
                                        note.text.map((line, index) => `${ index + 1 }. ${ line }`).join('\n')
                                    }`).join('\n\n')
                            }\n\nАвтор: mugroot - @awesomesk1ll`;
            ctx.reply(answer);
        }
    }));

    bot.command('status', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/status', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED && (ctx.message.text.trim()[0] === '/')) {
            //const info = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1);
            await updateUserData(ctx.user.id, 'input_mode', STATUS);
            ctx.reply('Теперь напиши сообщение для статуса.');
        }
    }));

    bot.command('feedback', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/feedback', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            await updateUserData(ctx.user.id, 'input_mode', FEEDBACK);
            ctx.reply('Теперь напиши свой фидбэк.');
        }
    }));

    bot.command('setinsta', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/setinsta', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            await updateUserData(ctx.user.id, 'input_mode', IG);
            ctx.reply('Теперь напиши свой ник из инсты.');
        }
    }));

    bot.command('setprivacy', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/setprivacy', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            ctx.reply('Управление настройками приватности:', privacy_keyboard(JSON.parse(ctx.user.privacy), ctx.user.ig));
        }
    }));

    bot.command('maphistory', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/maphistory', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            let nick = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1).split(/\s|@/)[0].toLowerCase() || ctx.user.nick;
            if (+ctx.user.role < ADMIN) {
                nick = ctx.user.nick;
            }
            const mapInfo = PEERS[nick] ? await getMapInfo( nick ) : false;

            let text = formatMapHistory(mapInfo, MAP_HISTORY_LENGTH);
            if (+ctx.user.role >= ADMIN) {
                text = `${ nick } - ` + text;
            }
            ctx.reply(text);
        }
    }));

    bot.command('campus', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/campus', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= REGISTERED) {
            // const mapInfo = await getMapInfo( 'mugroot' );
            let text = formatClustersData();
            ctx.replyWithHTML(text);
        }
    }));

    bot.command('poolinfo', (ctx) => user_handler(ctx, async (ctx) => {
        if (+ctx.user.role >= CONFIRMED) {
            let nick = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1).split(/\s|@/)[0].toLowerCase() || ctx.user.nick;
            if (+ctx.user.role < ADMIN) {
                nick = ctx.user.nick;
            }
            const info = await getPoolInfo( nick );
            console.log('/poolinfo', `${ctx.user.username} ${ctx.user.first_name} ${ctx.user.last_name} -> ${ nick }`, !!info);
            if (info) {
                const answer = `Информация о прохождении бассейна:\n\n`
                    + `Ник: ${info.name} - ${info.month}\n`
                    + `Опыт: ${ info.proj_exp } (${info.proj_exp_place} место)\n`
                    + `Выполнено: ${ info.completed } (${info.completed_place} место)\n`
                    + `Проверок: ${ info.checks } (${info.checks_place} место)\n`
                    + (info.tribe ? `Трайб: ${ info.tribe } (${info.tribe_pos} место - ${ info.tribe_exp } опыта)\n` : '')
                    + '\nОтзывы о проверках:\n'
                        + ` - заинтересованность - ${ info.interested }\n`
                        + ` - доброта - ${ info.nice }\n`
                        + ` - пунктуальность - ${ info.punctual }\n`
                        + ` - тщательность - ${ info.rigorous }\n\n`
                    + 'Умения:\n'
                        + ` - алгоритмы: ${info.Algorithms}\n`
                        + ` - линукс: ${info.Linux}\n`
                        + ` - структурное программирование: ${info['Structured programming']}\n`
                        + ` - типы и структуры данных: ${info['Types and data structures']}\n`
                        + ` - лидерство: ${info.Leadership}\n`
                        + ` - язык C: ${info['С']}\n`
                        + ` - Shell/Bash: ${info['Shell/Bash']}\n`
                        + ` - работа в команде: ${info['Team work']}\n`
                        + ` - БД и данные: ${info['DB & Data']}\n`;
                ctx.reply(answer).then(() => {
                    if (+ctx.user.role < ADMIN) {
                        ctx.reply('Если в данных имеется ошибка - пиши в суппорт. @awesomesk1ll');
                    }
                });
            } else {
                ctx.reply('Ошибка получения информации по бассейну. Пиши @awesomesk1ll.');
            }
        }
    }));

    bot.command('delete', (ctx) => user_handler(ctx, async (ctx) => {
        if (+ctx.user.role >= OWNER || +ctx.user.id === MODERATOR_IDS[0]) {
            const nick = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1).split(/\s|@/)[0].toLowerCase() || "";
            if (nick) {
                if (NICKNAMES[nick] || PEERS[nick]) {
                    const data = await getUserInfoByNick(nick);
                    console.log('/delete', `${ctx.user.username} ${ctx.user.first_name} ${ctx.user.last_name} ${ctx.user.nick} -> ${nick} (${ data ? 'found': 'not found'})`);
                    if (data) {
                        const res = await delUserInfoByNick(nick);
                        ctx.reply(`Юзер ${ nick }${ res ? '' : ' не' } удалён.`);
                    } else {
                        await ctx.reply(`Юзер ${ nick } не подходит по атрибутам или не найден.`);
                    }
                } else {
                    ctx.reply(`Ошибка: указан несуществующий ник.`);
                }
            } else {
                ctx.reply(`Ошибка: не указан ник.`);
            }
        } else {
            ctx.reply(`Ошибка: недостаточный уровень прав доступа.`);
        }
    }));

    bot.command('setrole', (ctx) => user_handler(ctx, async (ctx) => {
        if (+ctx.user.role >= OWNER || +ctx.user.id === MODERATOR_IDS[0]) {
            const nick = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1).split(/\s|@/)[0].toLowerCase() || "";
            const role = +ctx.message.text.substring(ctx.message.text.length-2) || 0;
            if (nick) {
                if (NICKNAMES[nick] || PEERS[nick]) {
                    const found = await getUserInfoByNick(nick);
                    console.log('/setrole', `${ctx.user.username} ${ctx.user.first_name} ${ctx.user.last_name} ${ctx.user.nick} -> ${nick} (${ found ? 'found': 'not found'})`);
                    if (found) {
                        await updateUserData(found.id, 'role', role);
                        ctx.reply(`Юзер ${ nick } ${ role ? 'получил новую роль' : 'забанен' } (${role}).`);
                    } else {
                        await ctx.reply(`Юзер ${ nick } не подходит по атрибутам или не найден.`);
                    }
                } else {
                    ctx.reply(`Ошибка: указан несуществующий ник.`);
                }
            } else {
                ctx.reply(`Ошибка: не указан ник.`);
            }
        } else {
            ctx.reply(`Ошибка: недостаточный уровень прав доступа.`);
        }
    }));

    bot.command('reload', (ctx) => user_handler(ctx, async (ctx) => {
        console.log('/reload', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);
        if (+ctx.user.role >= OWNER || +ctx.user.id === MODERATOR_IDS[0]) {
            await data_init();
            ctx.reply(`Сделано.`);
        } else {
            ctx.reply(`Ошибка: недостаточный уровень прав доступа.`);
        }
    }));

    bot.on('text', (ctx) => user_handler(ctx, async (ctx) => {
        bot.telegram.setMyCommands(cmds());
        console.log('/text', ctx.user.id, ctx.user.first_name, ctx.user.last_name, ctx.user.username, ctx.user.nick, ctx.user.role);

        if (not_in(+ctx.user.role, [BANNED, WRONG])) {
            if (+ctx.user.role === UNREGISTERED && +ctx.user.input_mode === NICKNAME) {
                const input = recognize(ctx.message.text);
                if (input && (input.type === 'mail' || input.type === 'nick')) {
                    if (NICKNAMES[input.value] || PEERS[input.value]) {
                        await updateUserData(ctx.update.message.from.id, 'nick', input.value);
                        if (+ctx.user.role == WRONG) {
                            ctx.reply('Ошибка установки ника: обратись за помощью к модератору.').then(() => {
                                bot.telegram.sendContact(ctx.update.message.from.id, '79639449443', 'Модератор бота');
                            });
                        } else {
                            ctx.reply('Ник успешно установлен.').then(async () => {
                                if (ctx.user.input_mode === PHONE) {
                                    ctx.reply('Теперь отправь свой контакт.', { reply_markup: { keyboard: [[{text: '📲 Отправить мой контакт', request_contact: true}]] } })
                                } else {
                                    await reg_handler(ctx);
                                }
                            });
                        }
                    } else {
                        ctx.reply(`Ошибка: указан несуществующий ник.`);
                    }
                } else {
                    ctx.reply(`Ошибка: не указан ник для установки.`);
                }

            } else if (+ctx.user.role >= REGISTERED && +ctx.user.input_mode === DEFAULT) {
                const input = recognize(ctx.message.text);
                let found, answer = '';
                if (input) {
                    if (input.type === 'cluster') {
                        // const mapInfo = await getMapInfo( 'mugroot' );
                        found = input.value;
                        answer = formatClustersData(false, found);
                    } else if (input.type === 'mail' || input.type === 'nick') {
                        if (NICKNAMES[input.value] || PEERS[input.value]) {
                            found = await getUserInfoByNick(input.value);
                        } else {
                            answer = 'Указан несуществующий ник.';
                        }
                    } else if (input.type === 'phone') {
                        found = await getUserInfoByPhone(input.value);
                    } else if (input.type === 'username') {
                        found = await getUserInfoByUsername(input.value);
                    }

                    if (found || PEERS[input.value]) {
                        if (input.type !== 'cluster') {
                            const mapInfo = await getMapInfo(found?.nick || input.value);
                            const privacy = found?.privacy ? JSON.parse(found.privacy) : false;
                            if (privacy.tg || found.status) {
                                answer += (found.nick ? found.nick : '')
                                    + ((privacy.tg && found.username) ? ` (@${ found.username })` : '')
                                    + (found.status ? `: ${ found.status }` : '');
                            }
                            if (privacy.contact && found.phone) {
                                if (found.username) {
                                    answer += `\nИмя: ${ found.first_name || '' } ${ found.last_name || '' }\nНомер: +${ found.phone }`;
                                } else {
                                    await bot.telegram
                                    .sendContact(ctx.update.message.from.id, found.phone, `${found.first_name} ${found.last_name}${found.nick ? (' (' + found.nick + ')') : ''}`)
                                    .catch((err) => {
                                        answer += `\nИмя: ${ found.first_name || '' } ${ found.last_name || '' }\nНомер: +${ found.phone }`;
                                        console.log('TG API unavailable for', err.response.parameters.retry_after);
                                    });
                                }
    
                            }
                            if (privacy.ig && found.ig) {
                                answer += `\nIG: https://www.instagram.com/${ found.ig }/`;
                            }
                            if (mapInfo) {
                                if (!mapInfo.status) {
                                    bot.telegram.sendMessage(MODERATOR_IDS[0], 'Сломался парсер карты, @awesomesk1ll');
                                }
                                answer += `\n\n` + formatMapData(mapInfo).format;
                            }
                        }
                        if (!answer) {
                            answer = `Доступная для отображения информация по ${ input.value } отсутствует.`;
                        }
                        ctx.replyWithHTML(answer);
                    } else {
                        await ctx.reply(answer || `Доступная для отображения информация по ${ input.value } отсутствует.`);
                    }

                } else {
                    ctx.reply(`Ошибка: запрос не распознан.`);
                }

            } else if (+ctx.user.role >= REGISTERED && +ctx.user.input_mode === IG) {
                const input = recognize(ctx.message.text);
                if (input && input.type === 'username') {
                    await updateUserData(ctx.update.message.from.id, 'ig', input.value);
                    ctx.reply(`Ник инсты успешно изменен.`);
                } else {
                    ctx.reply(`Ошибка: укажи валидный @инста_юзернейм!.`);
                }

            } else if (+ctx.user.role >= REGISTERED && +ctx.user.input_mode === STATUS) {
                const input = ctx.message.text.trim();
                if (input) {
                    await updateUserData(ctx.update.message.from.id, 'status', input);
                    ctx.reply(`Статус установлен.`);
                } else {
                    ctx.reply(`Ошибка: напиши текст для статуса.`);
                }

            } else if (+ctx.user.role >= REGISTERED && +ctx.user.input_mode === FEEDBACK) {
                const input = ctx.message.text.trim();
                if (input) {
                    await updateUserData(ctx.update.message.from.id, 'feedback', ctx.user.feedback ? `${ctx.user.feedback}|${input}` : input );
                    ctx.reply(`Спасибо за отзыв!`);
                } else {
                    ctx.reply(`Ошибка: напиши текст для фидбэка.`);
                }

            }
        }
    }));

    bot.launch();
}

bot_init();

/**
* Ниже хендлеры и прочие вспомогательные функции
*/
function cmds(role) {
    cmdlist = [
        { command: 'start', description: 'Запустить бота' },
        { command: 'help', description: 'Инфа о боте' },
        { command: 'cmdlist', description: 'Список доступных команд' },
        { command: 'support', description: 'Техническая поддержка' },
    ];
    if (role >= REGISTERED) {
        cmdlist.push({ command: 'campus', description: 'Показать заполнение кампуса' });
        cmdlist.push({ command: 'maphistory', description: 'Вывести историю сессий в кампусе' });
        cmdlist.push({ command: 'setinsta', description: 'Указать инстаграм' });
        cmdlist.push({ command: 'setprivacy', description: 'Настройки отображения контактных данных' });
        cmdlist.push({ command: 'status', description: 'Установить сообщение в профиле' });
        cmdlist.push({ command: 'feedback', description: 'Оставить пожелание / отзыв / багрепорт' });
        cmdlist.push({ command: 'changelog', description: 'Узнать, что нового у Морфея' });
    }
    if (role >= CONFIRMED) {
        cmdlist.push({ command: 'poolinfo', description: 'Показать инфу по прохождению бассейна' });
    }
    if (role >= OWNER) {
        cmdlist.push({ command: 'delete', description: 'Удалить информацию о пользователе' });
        cmdlist.push({ command: 'setrole', description: 'Изменить уровень доступа для пользователя' });
        cmdlist.push({ command: 'reload', description: 'Реинициализация' });
    }
    return cmdlist;
}

function not_in(val, arr) {
    return !arr.includes(val);
}

async function user_handler(ctx, func) {
    if (ctx.chat.type === 'private') {
        ctx.user = await getUserInfo( ctx.update.message?.from || ctx.update.callback_query.from ); // business data enrichment against boilerplating
        return await func(ctx);
    }
}

async function reg_handler(ctx) {
    const msg = 'Регистрация завершена. Теперь ты можешь использовать команды (доступные - /cmdlist).\n\n'
            + 'Для поиска пира просто напиши его ник, тг или номер телефона.';
    await updateUserData(ctx.user.id, 'role', REGISTERED);
    ctx.reply(msg);
    const text = 'Новая регистрация.\n\n'
            + (ctx.user.first_name ? `Имя: ${ ctx.user.first_name }\n` : '')
            + (ctx.user.last_name ? `Фамилия: ${ ctx.user.last_name }\n` : '')
            + (ctx.user.username ? `TG: @${ ctx.user.username }\n` : '')
            + (ctx.user.nick ? `Ник: ${ ctx.user.nick }\n` : '')
            + (ctx.user.phone ? `ТФ: ${ ctx.user.phone }\n` : '');
    bot.telegram.sendMessage(MODERATOR_IDS[0], text, proof_keyboard([ctx.user.nick])).then(() => {
        bot.telegram.sendContact(MODERATOR_IDS[0], ctx.user.phone, `${ctx.user.first_name} ${ctx.user.last_name}`);
    });
}
