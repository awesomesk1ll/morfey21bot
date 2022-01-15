require('dotenv').config();
const request = require('superagent');
const mapping = {
    tr: 'entry.363843153',
    se: 'entry.831615023',
    cl: 'entry.1388823262',
    ge: 'entry.547656992',
    ex: 'entry.1013958466',
    pr: 'entry.1957338878',
    in: 'entry.2027564708',
    ob: 'entry.1626869224',
    si: 'entry.1543949548',
    all: 'entry.559269391',
}
let previousData = {};

let isEqualData = (firstData, secondData) => {
    let res = true;
    for (property in firstData) {
        if (firstData[property] != secondData[property]) {
            res = false;
            break;
        }
    }
    return res;
}

const send = async (url, data, entries) => {
    if (!isEqualData(data, previousData)) {
        previousData = data;
        const payload = {};
        for (key in data) {
            if (entries[key]) {
                payload[entries[key]] = data[key];
            }
        }
        
        return await request.post(url).type('form').send(payload)
                            .end((err, res) => {
                                if (err || !res.ok) {
                                    return false;
                                } else {
                                    return true;
                                }
                            });
    }
    return true;
}

module.exports = {
    mapping,
    send
}
