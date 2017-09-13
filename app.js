var http = require('http');
var querystring = require('querystring');
var SF = require("./classes/novaWebViewerScheduleFetcher.js")();
var LF = require("./classes/googleSitesRosendalFoodFetcher.js")();


var server = http.createServer(function (req, res) {
    var path = req.url.split('?')[0];
    if (path == "/favicon.ico") { return res.end(); }
    if (path == "/schedule") { return writeSchedule(req, res); }
    if (path == "/lunch") { return writeLunch(req, res); }

    res.end('Server no understand. You good?');
});

server.listen(7422);

function writeSchedule(req, res, type) {
    var params = querystring.parse(req.url.split('?')[1]);
    var type = params.format;
    SF.getSchedule("81320", params.id, params.week).then((schedule) => {
        if (type === "text") {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.write(`
            <DOCTYPE html>
            <html>
            <head>
            <meta charset="UTF-8">
            <title>Schema</title>
            </head>
            <body>`);
            res.write('<div style="white-space: pre;">');
            res.write(JSON.stringify(schedule, null, 2));
            res.write(`
                    </div>
                </body>
            </html>`);
            res.end();
        } else if (type === "json") {
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(schedule));
        } else if (type === "html") {
            //Let us preprocess the schedule a little
            var modifiedSchedule = {
                "week": schedule.week,
                "days": {}
            };
            for (var dayKey in schedule.days) {
                var day = modifiedSchedule.days[dayKey] = {};
                var Day = schedule.days[dayKey];
                // need to add a for loop here
                if(Day.ty == 'I'){
                    day.type = "inline";
                } else if (Day.ty == 'B'){
                    day.type = "background";
                }
                day.startHour = Day.sh;
                day.endHour = Day.eh;
                day.startMinute = Day.sm;
                day.endMinute = Day.em;
                day.floatDuration = (Day.eh - Day.sh) + (Day.em - Day.sm) / 60;
                day.floatStart = Day.sh + Day.sm / 60;
                day.floatEnd = Day.eh + Day.em / 60;
                if(Day.bc === 'U'){
                    day.backgroundColor = "#ffffff";
                } else {
                    day.backgroundColor = Day.bc;
                }
                if(Day.bc === 'U'){
                    day.fontColor = "#000000";
                } else {
                    day.fontColor = Day.tc;
                }
                
            }
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.write(`
            <DOCTYPE html>
            <html>
            <head>
            <meta charset="UTF-8">
            <title>Schema</title>
            </head>
            <body>`);
            res.write('<div style="width:100%; height:100%;">');
            res.write('<div style="text-align:center;">' + params.week + "</div>");
            res.write('<div style="display:flex;">');
            function writeDay(day) {
                var dayText = "";
                switch (day) {
                    case "monday":
                        dayText = "Måndag";
                        break;
                    case "tuesday":
                        dayText = "Tisdag";
                        break;
                    case "wednesday":
                        dayText = "Onsdag";
                        break;
                    case "thursday":
                        dayText = "Torsdag";
                        break;
                    case "friday":
                        dayText = "Fredag";
                        break;
                }
                res.write('<div style="width:20%;">');
                res.write('<div style="text-align:center;">' + dayText + "</div>");
                for (var i = 0; i < schedule.days[day].length; i++) {
                    var thisDay = schedule.days[day][i];
                    var hourDuration = (thisDay.eh - thisDay.sh) + (thisDay.em - thisDay.sm) / 60;
                    res.write('<div style="min-height: ' + hourDuration * 2 + 'rem;word-wrap: break-word;background:' + schedule.days[day][i].bc + ';">')
                    res.write(hourDuration.toString() + ' ');
                    for (var j = 0; j < thisDay.tx.length; j++) {
                        res.write(thisDay.tx[j]);
                    }
                    res.write("</div>");
                }
                res.write("</div>");
            }
            for (var key in schedule.days) {
                writeDay(key);
            }
            res.write("</div>");
            //res.write(JSON.stringify(schedule, null, 2));
            res.write("</div>");
            res.write(`
                </body>
            </html>`);
            res.end();
        }

    })
        .catch((error) => {
            var err = {
                "error": "Sorry, something did not work"
            }
            console.log(error);
            res.write(JSON.stringify(err, null, 2));
            res.end();
        });
}

function writeLunch(req, res) {
    var params = querystring.parse(req.url.split('?')[1]);
    var type = params.format;
    if (type === "json") {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        LF.getLunch().then((lunch) => {
            res.end(JSON.stringify(lunch));
        });
    }
}
