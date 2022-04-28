/**
* Распознавание и форматирование инфы по карте
*/
const { table } = require('table');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
const timezone = require('dayjs/plugin/timezone');
const calendar = require('dayjs/plugin/calendar');
const utc = require('dayjs/plugin/utc');
const localizedFormat = require('dayjs/plugin/localizedFormat');
const ru = require('dayjs/locale/ru');

dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(calendar);
dayjs.extend(utc);
dayjs.locale(ru);
dayjs.tz.setDefault("Asia/Novosibirsk");

const CLUSTERS = {
    tr: { capacity: 53, students: [], _students: [], name: "Tranquility", path: '17 этаж, слева', color: 'оранжевый' },
    se: { capacity: 62, students: [], _students: [], name: "Serenity", path: '17 этаж, по центру', color: 'бирюзовый' },
    cl: { capacity: 42, students: [], _students: [], name: "Clarity", path: '17 этаж, справа', color: 'малиновый' },
    ge: { capacity: 57, students: [], _students: [], name: "Genesis", path: '18 этаж, слева', color: 'желтый' },
    ex: { capacity: 73, students: [], _students: [], name: "Existense", path: '18 этаж, по центру', color: 'фиолетовый' },
    pr: { capacity: 42, students: [], _students: [], name: "Presense", path: '18 этаж, справа', color: 'голубой' },
    in: { capacity: 57, students: [], _students: [], name: "Infinity", path: '20 этаж, слева', color: 'синий' },
    ob: { capacity: 72, students: [], _students: [], name: "Obscurity", path: '20 этаж, по центру', color: 'оранжево-красный' },    // , 
    si: { capacity: 42, students: [], _students: [], name: "Silence", path: '20 этаж, справа', color: 'сиреневый' },
}

const formatDuration = (ms) => {
    let secs = ms / 1000;
    const d = Math.floor(secs / (3600 * 24));
    secs -= d * 3600 * 24;
    const h = Math.floor(secs / 3600);
    secs -= h * 3600;
    const m = Math.floor(secs / 60);
    secs -= m * 60;
    const s = Math.floor(secs);
    const res = [];

    if (d) res.push(`${ d }д.`);
    if (h) res.push(`${ h }ч.`);
    if (m) res.push(`${ m }м.`);
    if (!d && !h && !m) res.push(`${ s }с.`);

    return res.join(' ');
}

const formatMapData = function (info, OLD_MAIN) {
    // console.log('campus', CLUSTERS);
    // console.log('mapuser', info.user.place, info.user.changed, info.updated);
    let cluster = info.user.place ? info.user.place.slice(0, 2) : false;
    let seat = info.user.place ? info.user.place.slice(3) : false;
    let changed = info.user.changed ? dayjs.tz(+info.user.changed, 'Asia/Novosibirsk') : false;
    let updated = info.updated ? dayjs(+info.updated) : false;
    let last_session = info.user.last_uptime ? +info.user.last_uptime : false;
    // console.log('info', info);
    // console.log('cluster', cluster);
    // console.log('seat', seat);
    // console.log('changed', changed);
    // console.log('updated', updated);

    let format = `Инфа из кампуса (получена ${ updated.fromNow() })\n`
               + (`Ник: ${ info.user.nick } (${OLD_MAIN[info.user.nick] ? 'старенький' : 'новенький'})\n`)
               + `${ info.user.level ? ('Уровень: ' + info.user.level + '\n') : '' }`
               + `${ info.user.exp ? ('Опыт: ' + info.user.exp + ' XP\n') : '' }`;

    if (cluster) {
        format += `\nКластер: ${ CLUSTERS[cluster].name } (${ CLUSTERS[cluster].path })\nМесто: ${
                        seat.toUpperCase()
                    }\nПришёл: ${
                        changed.calendar(null, {
                            sameDay: '[cегодня] в HH:mm',
                            lastDay: '[вчера] в HH:mm',
                            sameElse: 'DD.MM.YYYY в HH:mm',
                        })
                    } (~${ changed.fromNow() })`;
    } else {
        format += '\nОтсутствует в кампусе (или не за компом).';
        if (changed) {
            format += `\nУшёл ${ 
                        changed.calendar(null, {
                            sameDay: '[cегодня] в HH:mm',
                            lastDay: '[вчера] в HH:mm',
                            sameElse: 'DD.MM.YYYY в HH:mm',
                        })
                    } (~${ changed.fromNow() })`;
        }
        if (last_session) {
            format += `\nВремя сессии: ${formatDuration(last_session)}`;
        }
    }
    return { cluster, seat, format };
}

const formatMapHistory = function (info, limit) {
    const history = info?.user?._history?.length ? info.user._history : false;
    // const changed = info?.user?.changed ? dayjs(+info.user.changed) : false;
    let duration = 0;
    let format = 'История сессий';

    if (history) {
        history.forEach((row) => {
            duration += (row.to - row.from);
        });

        // if (changed) {
        //     format = `${ changed.calendar(dayjs(), {
        //         sameDay: '[cегодня], HH:mm',
        //         lastDay: '[вчера], HH:mm',
        //         sameElse: 'DD/MM/YYYY, HH:mm',
        //     })} (${ updated.fromNow() })`;
        // }
        format += `, всего: ${formatDuration(duration)}\n\n`;
        format += history
                .map((row, index) => `${
                        (index + 1 < 10) ? '  ' : ''
                    }${
                        index + 1
                    }. ${
                        row.seat
                    } - c ${
                        dayjs.tz(row.from, 'Asia/Novosibirsk').format('HH:mm')
                    } по ${
                        dayjs.tz(row.to, 'Asia/Novosibirsk').format('HH:mm DD.MM')
                    } - (${
                        formatDuration(row.to - row.from)
                })`)
                .slice(0, limit)
                .join('\n');
    } else {
        format = `История не содержит ни одной сессии.`;
    }

    return format;
}

const formatClustersData = function (info, code) {
    let format = '';
    let config;
    const data = [];
    
    if (!code) {
        let capacity = 0;
        let free = 0;
        let places = 0;
        config = {
            columns: {
                0: { paddingLeft: 0 },
                1: { alignment: 'center' },
                2: { paddingRight: 0 },
            },
            drawHorizontalLine: (lineIndex, rowCount) => {
                return lineIndex === 1 || lineIndex === rowCount - 1;
            },
            drawVerticalLine: (lineIndex, rowCount) => {
                return lineIndex > 0 && lineIndex < rowCount ;
            }
        };
        data.push(['Место', 'Занято', '%']);
        for (cluster in CLUSTERS) {
            capacity += CLUSTERS[cluster].capacity;
            free += CLUSTERS[cluster].free;
            places += CLUSTERS[cluster].students.length;
            data.push([
                CLUSTERS[cluster].name,
                `${ CLUSTERS[cluster].students.length } из ${ CLUSTERS[cluster].capacity }`,
                (CLUSTERS[cluster].students.length / CLUSTERS[cluster].capacity * 100).toFixed()
            ])
            
            // format += `${ CLUSTERS[cluster].name }: ${ 
            //             CLUSTERS[cluster].students.length } из ${
            //             CLUSTERS[cluster].capacity } (${
            //             (CLUSTERS[cluster].students.length / CLUSTERS[cluster].capacity * 100).toFixed()
            //         }%)\n`;
        }
        data.push(['Кампус', `${ places } из ${ capacity }`, (places / capacity * 100).toFixed()]);
        // format = `Кампус: ${ places } из ${ capacity }(${ (places / capacity * 100).toFixed() }%)\n\n` + format;
    } else {
        if (CLUSTERS[code]) {
            config = {
                columns: {
                    0: { paddingLeft: 0 },
                    2: { alignment: 'center' },
                    3: { alignment: 'right', paddingRight: 0 },
                },
                drawHorizontalLine: (lineIndex) => {
                    return lineIndex === 1;
                },
                drawVerticalLine: (lineIndex, rowCount) => {
                    return lineIndex > 0 && lineIndex < rowCount ;
                }
            };
            format = `Кластер: ${ CLUSTERS[code].name } (${ CLUSTERS[code].path })\n`
            format += `Занято: ${ 
                        CLUSTERS[code].students.length } из ${ 
                        CLUSTERS[code].capacity } (${ 
                        (CLUSTERS[code].students.length / CLUSTERS[code].capacity * 100).toFixed() 
                    }%)\n`;
            format += CLUSTERS[code].avg_exp ? `Опыт (средний): ${ CLUSTERS[code].avg_exp } XP\n` : '';
            if ( CLUSTERS[code].students.length ) {
                format += 'Пиры в кластере:\n';
                data.push(['Место', 'Ник', 'lvl', 'XP'])
                CLUSTERS[code].students.forEach((peer) => {
                    // console.log('peer is', peer);
                    data.push([ peer.seat, peer.nick, peer.level, peer.exp ]);
                })
            }
        }
    }

    return `${ format ? format : '' }${ data.length ? ('<pre>' + table(data, config).replace(/┼/g, '─') + '</pre>') : '' }`;
}

module.exports = {
    CLUSTERS,
    formatMapData,
    formatMapHistory,
    formatClustersData,
}
