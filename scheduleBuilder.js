const http = require('http');
const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { MongoClient, ServerApiVersion } = require('mongodb');

require("dotenv").config({ path: path.resolve(__dirname, '.env') }) 
const databaseAndCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION};
const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;

const weekdays = new Array("M","T","W","Th","F");
let currentSchedule = new Array(5).fill(new Array(5)).map((elem) => new Array(5).fill(""))
let loaded = false;
let availableCourses = new Array();
let registeredCourses = new Array();
let scheduleStatus = "";
let courseStatus = "";

process.stdin.setEncoding("utf8");

let portNumber = process.argv[2];

const uri = `mongodb+srv://${userName}:${password}@cmsc351.pixvvu7.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

app.get("/", async (request, response) => {

    if(loaded == false) {

        await initialize();
        loaded = true;
    }
    response.render("index");
});

app.get("/editSchedule", (request, response) => {

    
    let variables = {
        currentScheduleTable: getCurrentTable(),
        availableCoursesTable: getAvailableCoursesTable(),
        errorStatus: scheduleStatus
        
    }
    response.render("editSchedule", variables);
});

app.get("/editCourses", (request, response) => {

    
    let variables = {
        availableCoursesTable: getAvailableCoursesTable(),
        errorStatus: courseStatus
        
    }
    response.render("editCourses", variables);
});

app.get("/view", (request, response) => {

    let variables = {
        currentScheduleTable: getCurrentTable(),
        availableCoursesTable: getAvailableCoursesTable(),
    }

    
    response.render("view", variables);
});


app.use(bodyParser.urlencoded({extended:false}));

app.post("/processAdd", async (request, response) => {

    let {code, timeslot} = request.body;

    processAdd(code, timeslot, response).catch(console.error);
});

app.post("/processAddCourse", async (request, response) => {

    let course = request.body;


    processAddCourse(course, response).catch(console.error);

});

app.post("/processRemoveCourse", async (request, response) => {

    let {code}= request.body;

    processRemoveCourse(code, response).catch(console.error);
});

app.post("/processRemove", async (request, response) => {

    let {code}= request.body;

    currentSchedule = currentSchedule.map(x => {

        let i = x.indexOf(code)
        while (i !== -1){

            x[i] = ""
            i = x.indexOf(code)
        } 

        return x
    })

    console.log(currentSchedule)

    response.redirect("/editSchedule")
});


app.listen(portNumber); 
const prompt = "Stop to shutdown the server: "
process.stdout.write(`Web server started and running at http://localhost:${portNumber}\n`);
process.stdout.write(prompt);
process.stdin.on('readable', () => {  
    
	let dataInput = process.stdin.read();
	if (dataInput !== null) {

		let command = dataInput.trim();
		if (command === "stop") {

			console.log("Shutting down the server");
            process.exit(0);
        }

        process.stdout.write(prompt);
        process.stdin.resume();
    }
});


function getCurrentTable(){

    let table = `<table border="1">
            <thead>
                <tr>
                    <th></th>
                    <th>Monday</th>
                    <th>Tuesday</th>
                    <th>Wednesday</th>
                    <th>Thursday</th>
                    <th>Friday</th>
                 </tr>
            </thead>
            <tbody>`
    let count = 1;
    table = currentSchedule.reduce((row, elem) => {

        row += `<tr><td><strong>Timeslot ${count}</strong></td>`;
        count += 1;
        row = elem.reduce((res, ele)=>{
            return res + `<td>${ele}</td>`
        }, row)
        row += `</tr>`

        return row
    }, table);

    table += `</tbody>
            </table>`

    return table;

}

function getAvailableCoursesTable(){

    if (availableCourses.length == 0) {

        return `PLEASE LOAD COURSES FIRST`
    }

    let table = `<table border="1">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Days</th>
                    <th>Available Timeslots</th>
                    <th>Credits</th>
                 </tr>
            </thead>
            <tbody>`
    table = availableCourses.reduce((result, elem) => {

        let days = elem.days.map((elem)=>{

            return weekdays[elem-1]
        })
        result += `<tr><td>${elem.code}</td><td>${elem.name}</td><td>${days}</td><td>${elem.timeslot}</td><td>${elem.credits}</td></tr>`
        return result;
    }, table);
    table += `</tbody>
            </table>`

    return table;

}

async function processAdd(code0, timeslot0, response){

    try{
        await client.connect();

        let filter = {code: code0};
        const result = await client.db(databaseAndCollection.db)
                            .collection(databaseAndCollection.collection)
                            .findOne(filter);
        
        let {name, code, days, timeslot, credits} = result;

        let timeConflict = "";
        days.forEach(day => {
            
            if(currentSchedule[timeslot0-1][day-1] != "") {

                timeConflict = currentSchedule[timeslot0-1][day-1];
            }
            
        });

        if (registeredCourses.find((elem) => elem === code)) {

            scheduleStatus = `ERROR: You have already registered for ${code}`
        } else if (!timeslot.some(time => time == timeslot0)) {

            scheduleStatus = `ERROR: Timeslot ${timeslot0} is not one of the available options for ${code}`
        }else if (timeConflict != ""){

            scheduleStatus = `ERROR: ${code} has time conflict with ${timeConflict}`
        } 
        
        else {
            scheduleStatus = "";
            days.forEach(day => {
                
                currentSchedule[timeslot0-1][day-1] = code
            });
            registeredCourses.push(code)            
        }

        
        response.redirect('/editSchedule');


    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function processAddCourse(course, response){

    try {
        await client.connect();
       
        if (!course.days) {

            courseStatus = "ERROR: At least one day must be selected"
        } else if (!course.timeslot) {

            courseStatus = "ERROR: At least one timeslot must be selected"
        }
        else {

            courseStatus = ""
            if (typeof course.days == "string") {

                course.days = new Array(course.days)
            }

            if (typeof course.timeslot == "string") {

                course.timeslot = new Array(course.timeslot)
            }

            course.days = course.days.map(x => parseInt(x, 10))
            course.timeslot = course.timeslot.map(x => parseInt(x, 10))
            await client.db(databaseAndCollection.db)
                .collection(databaseAndCollection.collection)
                .insertOne(course);

            const cursor = client.db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .find({});
            
            availableCourses = await cursor.toArray();
        }
        response.redirect('/editCourses');
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function processRemoveCourse(code, response){

    try {
        await client.connect();
       
        let filter = {code: code};
        await client.db(databaseAndCollection.db)
                   .collection(databaseAndCollection.collection)
                   .deleteOne(filter);

        const cursor = client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .find({});
        
        availableCourses = await cursor.toArray();
        response.redirect('/editCourses');
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function initialize() {

    let result = await client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .deleteMany({});
    let json = JSON.parse(fs.readFileSync("initialCourses.json", 'utf-8'))
    result = await client.db(databaseAndCollection.db)
                        .collection(databaseAndCollection.collection)
                        .insertMany(json);
    availableCourses = json;
}
