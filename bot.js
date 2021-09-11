require('dotenv').config();
const { Telegraf } = require('telegraf');
const TIMEOUT = 300000;
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
	console.log('asdf');
	ctx.reply('Просто начни писать @verter21_bot текст на любом канале.');
})

/*
bot.on('sticker', (ctx) => {
    console.log('ctx', ctx);
	console.log('ctx', ctx.message);
});
*/

bot.on('inline_query', async (ctx) => {
    const result = Math.round((Math.random() * 100) * (Math.random() * 4) * 0.25);
	const text = `<b>Мой результат: </b> ${ result >= 26 ? "Completed" : "Fail"} (${ 1.5 * result } XP, ${result}%)`;
	return await ctx.answerInlineQuery([
		{
			type: 'sticker',
			id: ctx.update.update_id,
			sticker_file_id: 'CAACAgIAAxkBAAO6YTxbnqeETfSPs4_v-Z6-ga0dnGEAAlwAA2RhcS7JLCyaQaq8TiAE',
			input_message_content: { message_text: text, parse_mode: 'HTML' }
		}
	])
})

bot.launch();