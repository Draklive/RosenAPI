var PdfParser = require('pdf2json');
var http = require('http');
var querystring = require('querystring');

function Imp() { }

Imp.prototype.getSchedule = function (schoolid, id, week) {
    return this.requestPdf(schoolid, id, week)
        .then(pdf => this.parseToJson(pdf))
        .then(pdfJson => this.extractDatabyDay(pdfJson))
        .then(preParsed => this.linkScheduleData(preParsed));
}
Imp.prototype.requestPdf = function (schoolid, id, week) {
    return new Promise((resolve, reject) => {
        var options = {
            hostname: "www.novasoftware.se",
            path: "/ImgGen/schedulegenerator.aspx?format=pdf&schoolid=" + schoolid + "/sv-se&type=0&id=" + id + "&period=&week=" + week + "&mode=0&printer=1&colors=32&head=1&clock=1&foot=1&day=0&width=1240&height=1753&count=1&decrypt=0"
        };
        var request = http.request(options, function (res) {
            var data = new Buffer(0);
            res.on('error', err => reject(err));
            res.on('data', chunk => { data = Buffer.concat([data, chunk]); });
            res.on('end', () => resolve(data));
        });
        request.on('error', err => reject(err));
        request.end();
    });
}
Imp.prototype.parseToJson = function (pdf) {
    return new Promise((resolve, reject) => {
        var pdfParser = new PdfParser();
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => resolve(pdfData));
        pdfParser.parseBuffer(pdf);
    });
}

Imp.prototype.extractDatabyDay = function (pdfJson) {
    return new Promise((resolve, reject) => {
        // This is the tricky part
        // Therefore this part will contain extensive documentation
        // The schedule document is only one page long,
        // let us rename it in order to make it easier to see what is going on
        var page = pdfJson.formImage.Pages[0];
        // First off, sort the fills
        var fills = page.Fills.sort(sortFills);
        // The sort order will be "left to right: top to bottom"
        // This way fills for each day will be in sequential order
        // In this function used by the sort function, a and b are "fill" objects 
        function sortFills(a, b) {
            if (a.x < b.x) { return -1; }
            if (a.x > b.x) { return 1; }
            if (a.y < b.y) { return -1; }
            if (a.y > b.y) { return 1; }
            return 0;
        }
        // Since every object only has a position, an object
        // dedicated to keep tracked of passed elements becomes
        // very usefull in to track the current element relative
        // to previous elements
        var helpdata = {
            days: [
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday'
            ],
            currentDay: -1,
            lastWasNewDay: false,
        };
        // While we are at it, let us define an object to store the
        // parsed data to be returned
        var returnData = {};

        // The data will require a color dictionary
        var kColors = [
            '#000000', '#ffffff', '#4c4c4c', '#808080', '#999999', '#c0c0c0',
            '#cccccc', '#e5e5e5', '#f2f2f2', '#008000', '#00ff00', '#bfffa0',
            '#ffd629', '#ff99cc', '#004080', '#9fc0e1', '#5580ff', '#a9c9fa',
            '#ff0080', '#800080', '#ffbfff', '#e45b21', '#ffbfaa', '#008080',
            '#ff0000', '#fdc59f', '#808000', '#bfbf00', '#824100', '#007256',
            '#008000', '#000080', '#008080', '#800080', '#ff0000', '#0000ff',
            '#008000', '#000000'
        ];

        // The plan is to loop through all the fills and depending on its
        // values determine what kind of fill it is(time label backgrounds,
        // lesson block or some other miscelaneous fill) and take approperiate action
        for (var i = 0; i < fills.length; i++) {
            if (i < 2) {
                // this will trigger for the first two elements
                // the first one is totally garbage,m the secont one is the time table
                // on the left, nothing we need
                continue;
            }
            if (fills[i].w < 37.5 / 30 + 0.5 && fills[i].h < 13.14 / 30 + 0.5) {
                // This will trigger if a fill has the dimensions of a timelabel,
                // Therefore let us assume it is a time label
                // There is not very usefull information in this fill,
                // Head on to the next fill
                continue;
            }
            if (helpdata.lastWasNewDay) {
                // If this trigger, the last fill indicated that a new day had started
                // This will therefore most likely be a fill covering the entire day,
                // perfect for determining left and right borders of the day
                helpdata.lastWasNewDay = false;
                // do something usefull
                var helpDay = helpdata[helpdata.days[helpdata.currentDay]] = {};
                helpDay.leftBorder = fills[i].x;
                helpDay.rightBorder = fills[i].x + fills[i].w;
                helpDay.topBorder = fills[i].y;
                helpDay.bottomBorder = fills[i].y + fills[i].h;
                continue;
            }
            if (30 * Math.round(fills[i].y * 1000000) / 1000000 === 241.89) {
                // Set a mark indicating that there was a new day fill detected
                helpdata.lastWasNewDay = true;
                // If this trigger, this fill is very likely a fill above a day
                // Since the fills are sortert from left to right we can increment the day by one
                helpdata.currentDay++;
                // Create an array for this day to prepare for later pushing objects to it
                var day = helpdata.days[helpdata.currentDay];
                if (day !== undefined) {
                    returnData[day] = {};
                    returnData[day].lessonBlocks = [];
                    returnData[day].lessonInfo = [];
                    returnData[day].timeLabels = [];
                }
                // We are done with this block
                continue;
            }
            // If no statement above has matched the fill, we assume that it is a lesson block
            // If this fails then many things following will fail too
            // If the day is undefined the fills does not belong to any day,
            // therefore, only append a lesson block if it belongs to a day
            var day = helpdata.days[helpdata.currentDay];
            if (day !== undefined) {
                // Creating a new object containing relevant data for a lesson block
                // Figuring out the color using the dictionary if necessary
                var color = fills[i].clr;
                if (color === -1) {
                    color = fills[i].oc;
                } else {
                    color = kColors[color];
                }
                var lessonBlock = { "color": color, "startX": fills[i].x, "startY": fills[i].y, "endX": fills[i].x + fills[i].w, "endY": fills[i].y + fills[i].h };
                // Append the lesson block to an array to be returned
                returnData[helpdata.days[helpdata.currentDay]].lessonBlocks.push(lessonBlock);
            }
        }
        // Here, all the lessonblocks have been added and it is time to add
        // the textnodes
        // Let us loop through the text nodes
        var texts = page.Texts;
        // The texts does not need to be sorted, they will each be valuechecked
        for (var j = 0; j < texts.length; j++) {
            // Offsetting the text such that it is inside the lesson containers
            // because for some reason it is outside by default
            texts[j].y += 13.14 / 30;
            texts[j].x += 7.5 / 30;
            // Unescaping the texts from url-escaped to normal text
            var text = querystring.unescape(texts[j].R[0].T);


            var day = 'none';
            for (var d = 0; d < helpdata.days.length; d++) {
                var loopDay = helpdata.days[d];
                if (texts[j].x > helpdata[loopDay].leftBorder &&
                    texts[j].x < helpdata[loopDay].rightBorder &&
                    texts[j].y > helpdata[loopDay].topBorder &&
                    texts[j].y < helpdata[loopDay].bottomBorder) {
                    // The text qualified as the day of this loop
                    day = loopDay;
                    // Nothing more to find, break the loop
                    break;
                }
            }
            if (day === 'none') {
                // The text fell outside all days
                // Therefore it is not usefull to us
                continue;
            }
            // A day has been assigned to the text
            // Now, let us determine the type of the text
            // This is seraching the text for a time label
            if (text.search(/\b[0-9]{2}:[0-9]{2}\b/) !== -1) {
                // When this trigger it is very likely a time label
                var splitTime = text.split(":");
                var hour = parseInt(splitTime[0], 10);
                var minute = parseInt(splitTime[1], 10);
                var decimalHour = hour + minute / 60;
                var timeLabel = { "hour": hour, "minute": minute, "decimalHour": decimalHour };
                // Append the time label to the return data
                returnData[day].timeLabels.push(timeLabel);
                continue;
            }
            // Exclusion methods give that this is lesson information
            // Let us roll with that
            // Figuring out the color using the dictionary if necessary
            var color = texts[j].clr;
            if (color === -1) {
                color = texts[j].oc;
            } else {
                color = kColors[color];
            }
            var lessonInfo = { "color": color, "x": texts[j].x, "y": texts[j].y, "text": text };
            // Append the lesson information to the return data
            returnData[day].lessonInfo.push(lessonInfo);
        }
        // Sorting the time labels for each day will prove very usefull later
        function sortTime(a, b) {
            if (a.decimalHour > b.decimalHour) { return 1; }
            if (a.decimalHour < b.decimalHour) { return -1; }
            return 0;
        }
        for (var key in returnData) {
            returnData[key].timeLabels.sort(sortTime);
        }
        resolve(returnData);
    });
}

Imp.prototype.linkScheduleData = function (preParsedData) {
    // If the previous function did its job, this function should have a hard time failing
    var days = {};
    for (var key in preParsedData) {
        days[key] = [];
        // Fist, find the lowest coordinate and the highest;
        if (preParsedData[key].lessonBlocks.length === 0) {
            // There are no lessons this day
            // Something should be added for consistency tho
            continue;
        }
        var highestCoordinate = undefined;
        var lowestCoordinate = undefined;
        for (var i = 0; i < preParsedData[key].lessonBlocks.length; i++) {
            var top = preParsedData[key].lessonBlocks[i].startY;
            if (lowestCoordinate === undefined || top < lowestCoordinate) {
                lowestCoordinate = top;
            }
            var bottom = preParsedData[key].lessonBlocks[i].endY;
            if (highestCoordinate === undefined || bottom > highestCoordinate) {
                highestCoordinate = bottom;
            }
        }
        var highestTime = preParsedData[key].timeLabels[preParsedData[key].timeLabels.length - 1].decimalHour;
        var lowestTime = preParsedData[key].timeLabels[0].decimalHour;

        // The idea is to make a linear regression between the
        // two points (lowestTime, lowestCoordinate) and (highestTime, highestCoordinate)

        // This is the equation system we want to set up
        // time = pitch * coordinate + offset
        // This way we can set up a function that can estimate the time using coordinates

        // First calculate the pitch
        // pitch =  deltaTime / deltaCoordinate
        var pitch = (highestTime - lowestTime) / (highestCoordinate - lowestCoordinate);
        // Then calculate the offset
        // offset = coordinate - pitch * time
        var offset = lowestTime - pitch * lowestCoordinate;
        // Test and log the values
        for (var t = 0; t < preParsedData[key].lessonBlocks.length; t++) {
            var startTime = pitch * preParsedData[key].lessonBlocks[t].startY + offset;
            var endTime = pitch * preParsedData[key].lessonBlocks[t].endY + offset;
        }
        // Now, all the above was to be avle to calculate aproximate values,
        // let us match those to some actual values
        // loop through all the lessons, find the best start and end time and,
        // also find the text that should go with the lesson
        // This is done backwards in order to remove text from workhours

        // This variable will receive the removed text elements,
        // these are used to decide wether blocks are overlapping or not
        var removedText = [];

        for (var v = preParsedData[key].lessonBlocks.length - 1; v >= 0; v--) {
            // Calculate approximate values
            var lesson = preParsedData[key].lessonBlocks[v];
            var estimatedStart = pitch * lesson.startY + offset;
            var estimatedEnd = pitch * lesson.endY + offset;
            // Defining a function that selects the best value from a list based on an aproximation
            function findBestMatch(estimatedTime) {
                var current = 0;
                var index = 0;
                for (var e = 0; e < preParsedData[key].timeLabels.length; e++) {
                    var decimalHour = preParsedData[key].timeLabels[e].decimalHour;
                    if (Math.abs(estimatedTime - current) > Math.abs(estimatedTime - decimalHour)) {
                        current = decimalHour;
                        index = e;
                    }
                }
                return preParsedData[key].timeLabels[index];
            }
            var lessonStart = findBestMatch(estimatedStart);
            var lessonEnd = findBestMatch(estimatedEnd);
            // So far only the times have been decided for the lesson block


            if (preParsedData[key].lessonInfo.length !== 0) {
                // If this trigger there is lesson Information left
                // This function will cut out information as it loops over
                var lessonInfo = [];
                var textColor = preParsedData[key].lessonInfo[0].color.trim();
                var type = 'I';
                var indexToremove = [];
                for (var r = 0; r < preParsedData[key].lessonInfo.length; r++) {
                    // The if statement below decides if the information is inside
                    // this lesson block or not
                    var tex = preParsedData[key].lessonInfo[r];
                    if (tex.x > lesson.startX &&
                        tex.x < lesson.endX &&
                        tex.y > lesson.startY &&
                        tex.y < lesson.endY) {
                        // This information belong to this lesson and will be appended
                        // to this lessons info but cut out from the original list
                        lessonInfo.push(tex.text);
                        indexToremove.push(r);
                    }
                }
                for (var h = 0; h < indexToremove.length; h++) {
                    removedText.push(tex);
                    // If this sort is not here indexes will shift when removing one making it totally useless
                    indexToremove.sort(function (a, b) { return b - a });
                    preParsedData[key].lessonInfo.splice(indexToremove[h], 1);
                }
                // If no data was added, there is a posibility that this is a overlapping block,
                // therefore we check for overlapping using previously removed text data
                if (lessonInfo.length === 0) {
                    // If this block is overlapping removed text we set the type to B, background
                    if (isOverlap(lesson)) {
                        type = 'B';
                    }
                } else {
                    // It can not be overlapping
                    // It would be nice to sort the information in the order left to right top to bottom
                    function sortLessonInfo(a, b) {
                        if (a.y < b.y) { return -1; }
                        if (a.y > b.y) { return 1; }
                        if (a.x < b.x) { return -1; }
                        if (a.x > b.x) { return 1; }
                        return 0;
                    }
                    lessonInfo.sort(sortLessonInfo);
                }
            } else {
                // There is no info left, so either this is an empty lesson or it is a overlapping block
                var lessonInfo = [];
                var textColor = 'U';
                if (isOverlap(lesson)) {
                    var type = 'B';
                } else {
                    var type = 'I';
                }
            }
            // This function returns true if the block contain any previously removed text elements
            function isOverlap(lessonblock) {
                for (var u = 0; u < removedText.length; u++) {
                    if (removedText[u].x > lessonblock.startX &&
                        removedText[u].x < lessonblock.endX &&
                        removedText[u].y > lessonblock.startY &&
                        removedText[u].y < lessonblock.endY) {
                        return true;
                    }
                }
                return false;
            }

            // We are now ready to create the lesson
            var resultLesson = {
                "ty": type,
                "sh": lessonStart.hour,
                "sm": lessonStart.minute,
                "eh": lessonEnd.hour,
                "em": lessonEnd.minute,
                "bc": lesson.color,
                "tc": textColor,
                "tx": lessonInfo
            }
            days[key].push(resultLesson);
        }
        // Purely estetical thing, since we worked from bottom to top but
        // it is nicer to have it in the reverse order
        days[key].reverse();
    }
    var scheduleObj = {
        "days": days
    };
    return scheduleObj;
}

function Schedule() { }
var Implementation = new Imp();

Schedule.prototype.getSchedule = function(schoolid, id, week){
    return Implementation.getSchedule(schoolid, id, week);
}

module.exports = function () { return new Schedule(); }
