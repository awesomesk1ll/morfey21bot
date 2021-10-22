const { Markup } = require('telegraf');

/**
* Инлайновые клавиатуры
*/
const proof_keyboard = (arr = []) => Markup.inlineKeyboard([
    Markup.button.callback('👍', (['proof:1', ...arr].join(':')), false),
    Markup.button.callback('👎', (['proof:', ...arr].join(':')), false)
]);

const registration_keyboard = (user, arr = []) => {
    const buttons = [];
    if (!user.phone) buttons.push(Markup.button.callback('Указать 📱', (['registration:phone', ...arr].join(':')), false));
    if (!user.nick) buttons.push(Markup.button.callback('Указать ник ШК 21', (['registration:nick', ...arr].join(':')), false));
    
    return Markup.inlineKeyboard(buttons).resize(true);
}

const privacy_keyboard = (privacy, ig) => {
    const buttons = [[], []];
    const privacy_mask = `${privacy.contact ? 1 : 0}${privacy.tg ? 1 : 0}${privacy.ig ? 1 : 0}`;
    const tg_text = (privacy.contact && 'Контакт (всё)') || (privacy.tg && 'Только ник') || 'Ничего';

    buttons[0].push(Markup.button.callback(`TG: ${ tg_text }`, (['privacy:tg', privacy_mask].join(':')), false));
    if (ig) {
        buttons[0].push(Markup.button.callback(`IG: ${privacy.ig ? 'Показывать' : 'Скрыть'}`, (['privacy:ig', privacy_mask].join(':')), false));
    }
    buttons[1].push(Markup.button.callback('Закрыть', (['privacy:close', privacy_mask].join(':')), false));

    return Markup.inlineKeyboard(buttons);
}

module.exports = {
    proof_keyboard,
    registration_keyboard,
    privacy_keyboard
}