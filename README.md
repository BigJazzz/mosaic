# Strata Attendance Management
## Outline
This app is designed to provide a flexible, dynamic way to mark attendance at meetings, both in person and via proxy. It contains the following modules
- User login and management
- Attendee sign in
- Current attendees list
- PDF report and emailer

## Features
### Access & Authorisation
- Username, password, and authorisation token for caching to login
- Admin and user roles
	- User roles can be restricted to just one strata plan
 - Admins can change the meeting type

### Data Management
- Two spreadsheets are used
 - A Master Data spreadsheet that contains a list of strata plan numbers and their suburbs, the user list, and the strata roll for each plan stored in separate tabs and labelled with the strata plan number
	- An Attendance spreadsheet that contains the Lot and Unit numbers for the strata plan, stored in tabs labelled with the strata plan number
	- Attendance tabs for a strata plan are automatically created the first time the strata plan is selected
 - Three dynamic columns are used to record attendance. They are created the first time the strata plan is selected for the day, and all start with the date:
	- The meeting type is set either on first creation of the columns, or changed through the admin interface
		- Meeting Type
		- Name
		- Financial or Committee status (this will change depending on the meeting type)

### Owner Attendance
- Fetches the strata roll from the provided spreadsheet and tab
	- The tab **must** be named with the strata plan number
	- The roll is cached offline for 6 hours, allowing for offline attendance marking and instant searching
- Mark a lot as attended
	- The lot can also be marked as financial for voting purposes
	- If the owner is a company, the app will ask for the lot's representative
	- If the owner is voting by proxy, the app will ask for the proxy holder's lot or name
	- If the lot has multiple owners that turn up, all listed owners are able to be checked in
	- Attendance is cached offline and automatically batch uploaded every 60 seconds, unless manually submitted earlier
	- Cached entries are tagged during upload to ensure all entries are submitted before removing
- Entries can be deleted if a mistake is made

### Current Attendees List
- Shows the captured attendance, colour-coded for easy reference
 - ```diff - Red```