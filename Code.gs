/*
# Instructions

1. Create a new integration for your own use. Open: https://www.notion.so/my-integrations
1a. Give it a name, make sure your workspace is selected, make sure you give it read, update, & insert privledged at a minimum
1b. Click "Submit"

2. Copy the INTERNAL INTEGRATION TOKEN paste to the 'secret' configuration constant below

3. Copy your task management database's page ID to the 'databaseId' configuration constant below

4. Create a 'select' property in your task management database. Name it 'recur' (or whatever, just update the name below)
4a. For any task you want to recur, fill in this select property with the following format:

5. Adjust for JavaScripts terrible timezone nonsense in the 'timezoneOffset' configuration constant.
    This controls which date tasks will be retreived from and affect when they're made due again.
    If you leave it as is without confirming your UTC Timezone offset (in seconds) you may have due dates be off by a day

6. Here in Google Apps Script, set a Trigger for this script that runs every day from Midnight to 1am.

7. Test that this functions as you expect. 
7a. Create a test recurring task and set its Recur property to '1 Day from Done'
7b. Complete that task within Notion
7c. Click run ⬆️
7d. Confirm Notion updates the due date and unchecks the "Done" checkbox (may take a minute, may have to refresh the page)
*/


/**
 * Configuration constants
 */
const databaseId = // looks like "170fg769795a4721bed237cebf6bfa82"; //the UUID of the page. 
const secret = // looks like 'secret_.....'; //your INTERNAL INTEGRATION TOKEN
const recurPropName = "Recur"; // must be a select-type property, must follow the "# days|weeks|months from Due|Date" schema
const datePropName = "Date"; // must be a date-type property
const donePropName = "Done"; // must be the checkbox property you use to mark things complete
const timezoneOffset = -18000; // your timezone offset from UTC time, in seconds. For example, 18000 = 5 hours, & CDT is currently -5 hours from UTC, so it's -18000 for me.

/**
 * This is the main function. It queries the Notion API for completed recurring tasks
 * and then calls up the helper function below to reset them.
 */
function setNextOccurence(){
  let url = encodeURI("https://api.notion.com/v1/databases/" + databaseId + "/query")
  
  let options = {
      'method': 'POST',
      'muteHttpExceptions': true,
      'contentType':"application/json",
      'headers': {
        'Notion-Version': '2022-02-22', // refer https://developers.notion.com/reference/versioning
        'Authorization': Utilities.formatString('Bearer %s', secret)
      },
      "payload": JSON.stringify({"filter":{
        "and": [
          {
            "property": "Done",
            "checkbox": {
              "equals": true
            }
          }, 
          {
            "property":"Recur",
            "select":{
              "is_not_empty":true
            }
          }]
        }
      })
    };

  let response = UrlFetchApp.fetch(url, options);
  let result = JSON.parse(response.getContentText());
  
  let tasksToReset = result.results.map(task=>{
    return {
      id: task.id,
      done: task.last_edited_time,
      date: task.properties[datePropName].date.start,
      recur: task.properties[recurPropName].select.name
    }
  })

  //Logger.log(tasksToReset);
  /**
   * This loop determines the next date & calls the routine that actually resets them.
   * 
   * The "Recur" property must be a select following a schema like below:
   * "A B C D"
   * A - the number of intervals between occurences
   * B - the unit of intervals, right now must be "Days", "Weeks", or "Months" (actually just 'd','w', and 'm' would suffice)
   * C - anything, this is ignored but it must be there. It's included to make it read more like english in the "select" wording
   * D - must be either "Due" or "Done" (you could also use "Complete" instead of done. Really "due" is what matters)
   * 
   * Examples: 
   * - "2 Weeks from Due" to have it recur 2 weeks from its due date
   * - "1 Day from Done" to have something recur up the day after you complete it
   */
  tasksToReset.forEach(task=>{
    let recurUnit = task.recur.split(' ')[1].substr(0,1);
    let recurNum = Number.parseInt(task.recur.split(' ')[0]);
    let recurFrom = task.recur.split(' ')[3];
    let firstDate = new Date(new Date(task.done) + timezoneOffset); //-18000 for timezone offset
    if(recurFrom.toUpperCase() == "DUE"){ //case doesn't matter
      firstDate = new Date(task.date);
    }
    // console.log("add " + recurNum + " of " + recurUnit + " to " + firstDate);
    let secondDate = new Date(firstDate.getTime());
    if(recurUnit.toUpperCase() == "D"){
      secondDate.setDate(secondDate.getDate() + recurNum);
    }else if (recurUnit.toUpperCase() == "W"){
      secondDate.setDate(secondDate.getDate() + recurNum * 7)
    }else if (recurUnit.toUpperCase() == "M"){
      secondDate.setMonth(secondDate.getMonth() + recurNum);
    }else{
      throw new Error("Your recur unit wasn't supported. It was " + recurUnit);
    }
    Logger.log({
      first: firstDate,
      adder: recurNum,
      second: secondDate
    })
    resetTaskTo(task.id, secondDate);
  })
}

/**
 * Sends the Notion API the web request to update the passed in task, 
 * setting it's Date property to the passed in newDate.
 * Currently doesn't support setting *times*. Only days.
 * 
 * @param id (string) the UUID of the page for the task
 * @param newDue (Date) the date to set the task to
 */
function resetTaskTo(id, newDue){
  console.log(id, newDue);
  let url = encodeURI("https://api.notion.com/v1/pages/" + id)
  
  let options = {
      'method': 'PATCH',
      'muteHttpExceptions': true,
      'contentType':"application/json",
      'headers': {
        'Notion-Version': '2022-02-22', // refer https://developers.notion.com/reference/versioning
        'Authorization': Utilities.formatString('Bearer %s', secret)
      },
      "payload": JSON.stringify({"properties":
        {
          [donePropId]: {
            "checkbox": false
          },
          [datePropName]:{
            "date":{
              "start": newDue.toISOString().substr(0,10)
            }
          } 
        }
      })
    };

  let response = UrlFetchApp.fetch(url, options);
  let result = JSON.parse(response.getContentText());
  Logger.log(result);
}
