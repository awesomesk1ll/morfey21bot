require('dotenv').config();
const { Telegraf } = require('telegraf');
const TIMEOUT = 300000;
const bot = new Telegraf(process.env.BOT_TOKEN);
const request = require('request');
const admRegex = /админ|aдмин|admin|аdmin|adмin/i;

let handle;
let mail_date;
let mail_name;

const answer = (ctx, msg) => {
	if (ctx.chat.type === 'private') {
		ctx.reply(msg);
	} else {
		console.log(msg);
	}
}

bot.start((ctx) => {
	if (ctx.chat.type === 'private') {
		ctx.reply('Просто начни писать @verter21_bot текст на любом канале.');
		bot.telegram.setMyCommands([
            { command: 'status', description: 'Изменить статус во флудилке доплывших' }
        ]);
	}
});

// chat id -1001594852516
bot.command('status', (ctx) => {
    if (ctx.chat.type != 'private') {
		const delete_id = ctx.message.message_id;
		bot.telegram.deleteMessage(-1001594852516, delete_id).then(action => {
			console.log(`Сообщение [ID:${delete_id}] удалено.`);
		}).catch(err => {
			console.log(`Не получилось удалить сообщение [ID:${delete_id}].`);
		})
	}
	const status = ctx.message.text.substring(ctx.message.text.split(' ')[0].length + 1);
	console.log(ctx.message.from);
	console.log('status', status);
	if (status) {
		bot.telegram.promoteChatMember(-1001594852516, ctx.message.from.id, {can_pin_messages: true}).then(action => {
			if (status.length <= 16 && !status.replace(/\s/gm, '').match(admRegex)) {
				bot.telegram.setChatAdministratorCustomTitle(-1001594852516, ctx.message.from.id, status).then(action => {
					answer(ctx, `Твой статус успешно изменён на "${status}".`);
				}).catch(err => {
					console.log(err);
					answer(ctx, `Не получилось изменить твой статус.
Причина: ${err.response.description}`);
				});
			} else {
				answer(ctx, `n/a`);
			}
		}).catch(err => {
			console.log(err);
			answer(ctx, `Не получилось изменить права пользователя.
Причина: ${err.response.description}`);
			});	
	} else {
		bot.telegram.promoteChatMember(-1001594852516, ctx.message.from.id, false).then(action => {
			answer(ctx, 'Твой статус удалён.');
		}).catch(err => {
			console.log(err);
			answer(ctx, `Не получилось изменить права пользователя.
Причина: ${err.response.description}`);
			});
        }
});

bot.on('sticker', (ctx) => {
    // console.log('ctx', ctx);
});

bot.on('text', (ctx) => {
    // console.log('ctx', ctx);
});

bot.on('inline_query', async (ctx) => {
    const result = Math.round((Math.random() * 100) * (Math.random() * 4) * 0.25);
	const text = `<b>Мой результат: </b> ${ result >= 26 ? "Completed ✅" : "Fail ❌"} (${ 1.5 * result } XP, ${result}%)`;
	return await ctx.answerInlineQuery([
			{
				type: 'sticker',
				id: ctx.update.update_id,
				sticker_file_id: 'CAACAgIAAxkBAAO6YTxbnqeETfSPs4_v-Z6-ga0dnGEAAlwAA2RhcS7JLCyaQaq8TiAE',
				input_message_content: { message_text: text, parse_mode: 'HTML' }
			}
		],
		{
			inline_query_id: ctx.update.inline_query.id,
			cache_time: 0
		}
	)
});

function checkUpdate() {
    request({ method: 'GET', uri: 'https://archive.sendpulse.com/u/NzA5OTc3OQ==/Acb6c5583/', gzip: true}, function (error, response, body) {
        let rows = body.split(/<div class="send-date cell">/gm);
        let date = rows[1] ? rows[1].replace(/\s*/, '').split('г.')[0] : false;
        let name = rows[1] ? body.split(/<a target="_blank" title="/gm)[1].split('"')[0] : false;
	if (date && name) {
		if (!mail_name) {
			mail_name = name;
			mail_date = date;
		}
		if (mail_name === name) { // ничего не поменялось
			console.log('Всё по старому.', date, name);
        	} else { // новая рассылочка Оп оп.
			bot.telegram.sendMessage(-1001594852516, `А вот и письма полетели!\n${name}\n// popcorn`);
			bot.telegram.sendSticker(-1001594852516, 'CAACAgIAAxkBAAO6YTxbnqeETfSPs4_v-Z6-ga0dnGEAAlwAA2RhcS7JLCyaQaq8TiAE');
			bot.telegram.sendMessage(424895349, `Новая рассылка в ШК21!\n${name}`);
			// clearInterval(handle);
        	}    
	}
    });
}

handle = setInterval(checkUpdate, 5000);

bot.launch();
