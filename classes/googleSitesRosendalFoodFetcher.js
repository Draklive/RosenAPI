var https = require('https');
var htmlparser = require('htmlparser2');

function Imp() {
    this.lunch = null;
    this.update();
    this.setUpdateInterval();
}

Imp.prototype.getLunch = function () {
    return new Promise((resolve, reject) => {
        if (this.lunch === null) {
            reject("No lunch avalible at the moment");
        } else {
            resolve(this.lunch);
        }
    });
};

Imp.prototype.setUpdateInterval = function() {
    setInterval(()=>{this.update}, 3600000);
}

Imp.prototype.update = function (callback) {
    return new Promise((resolve, reject) => {
        var options = {
            "hostname": "sites.google.com",
            "path": "/a/rosendalsgymnasiet.se/rosnet/veckans-mat",
            "method": "GET"
        }
        var req = https.request(options, (res) => {
            res.setEncoding('utf8');
            var data = '';
            var parsedData = {
                days:{}
            };
            var lastDay;
            var parser = new htmlparser.Parser({
                ontext: (text) => {
                    if (parsedData.week === undefined) {
                        if (text.toLowerCase().search('vecka') !== -1) {
                            var weekNumber = parseInt(text.replace(/^\D+/g, ''), 10);
                            if (weekNumber !== NaN) {
                                parsedData.week = weekNumber;
                                return;
                            }
                        }
                    }
                    if (parsedData.monday === undefined) {
                        if (text.toLowerCase().trim() === 'måndag') {
                            lastDay = parsedData.days.monday = [];
                            return;
                        }
                    }
                    if (parsedData.tuesday === undefined) {
                        if (text.toLowerCase().trim() === 'tisdag') {
                            lastDay = parsedData.days.tuesday = [];
                            return;
                        }
                    }
                    if (parsedData.wednesday === undefined) {
                        if (text.toLowerCase().trim() === 'onsdag') {
                            lastDay = parsedData.days.wednesday = [];
                            return;
                        }
                    }
                    if (parsedData.thursday === undefined) {
                        if (text.toLowerCase().trim() === 'torsdag') {
                            lastDay = parsedData.days.thursday = [];
                            return;
                        }
                    }
                    if (parsedData.friday === undefined) {
                        if (text.toLowerCase().trim() === 'fredag') {
                            lastDay = parsedData.days.friday = [];
                            return;
                        }
                    }
                    if (parsedData.every === undefined) {
                        if (text.toLowerCase().search('varje dag') !== -1) {
                            lastDay = parsedData.days.every = [];
                            lastDay.push(text.trim());
                            return;
                        }
                    }
                    if (lastDay === undefined) {
                        return;
                    } else {
                        if (text.trim() !== '') {
                            lastDay.push(text.trim());
                            return;
                        }
                    }
                },
                onend: () => {
                    this.lunch = parsedData;
                    resolve();
                }
            });

            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                data = data.split('<td class="sites-layout-tile sites-tile-name-content-1">')[1].split('</td>')[0];
                parser.write(data);
                parser.end();
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
};

function Lunch() { }

var Implementation = new Imp();

Lunch.prototype.getLunch = function () {
    return Implementation.getLunch();
};


module.exports = function () { return new Lunch(); }
