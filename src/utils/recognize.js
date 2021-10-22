/**
* Распознавание и форматирование значения (почта, юзернейм ТГ, ник платформы, телефон)
*/
const MAIL = /^[a-z]+@student\.21-school\.ru$/;
const USERNAME = /^@[a-z0-9_]+$/;
const NICK = /^[a-z]+$/;
const NUM = /\d/g;

module.exports = function (input) {
    let res = {};
    input = input.trim().toLowerCase();

    if (NICK.test(input)) {
        res.value = input;
        res.type = 'nick';
    } else if (MAIL.test(input)) {
        res.value = input.split('@')[0];
        res.type = 'mail';
    } else if (USERNAME.test(input)) {
        res.value = input.split('@')[1];
        res.type = 'username';
    } else {
        let nums = input.match(NUM);
        if (nums) {
            if (nums.length === 11) {
                res.value = nums.join("").replace(/^8/, '7');
                res.type = 'phone';
            } else if (nums.length === 10) {
                res.value = '7' + nums.join("");
                res.type = 'phone';
            }
        }
    }

    return res.value ? res : false;
}
