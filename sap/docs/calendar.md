# Planning calendar

The Calendar page follows the SAC Calendar. Code: `zsac.lib/calendar` (CalendarEngine, CalendarView, TaskRunner) and the page in `sacfiori` (`Calendar.controller.js`, `model/EventPanel.js`, `model/EventWizard.js`).

## Workspaces
* **List**: a tree of events and processes (expand and collapse) with status, progress, start and end date, and a timeline beside it with the bars, the finished part of each bar, hatching for events on hold, a dashed line for today and Day, Week, Month and Year zoom. A process shows the range of its children, their average progress and a status worked out from theirs.
* **Calendar**: month, week and day grids; a day with more than three events has a "more" link.
* Search, **Filter** (due: today, next 7 or 30 days, this month, overdue; type; status; assignee; plan, shown as chips that can be taken off one by one), **Mine** (events you own, are assigned to or may view), earlier, later, Today.
* **Columns**: the list shows the columns the user chooses (status, progress, start, end, type, assignee, plan, owner; kept in the browser). When the divider between the list and the timeline is moved so the list gets narrow, columns drop out, the least important first, instead of spilling over the timeline.
* **Export** gives the list (with the filters) as a CSV file for a spreadsheet; a cell that would be read as a formula is made text.
* **Checkboxes** select several events: delete them (with what is inside them) or change their status in one go (Start, Hold, Resume, Complete, Cancel, Reopen: for the events it is possible for).
* **Colours**: each event has a colour, shown on the row and on its bar.
* **Drag**: a bar of the timeline can be moved, or its start or end dragged, in whole days; in the calendar an event is dragged to another day. Only events the user can change, and only those with dates of their own (a process takes its dates from its tasks).

## Events
Types: General Task, Review Task, Composite Task, Process, **Data Locking Task**, **Data Action Task** and **Multi Action Task**; *Process from Template* (Budget cycle, Month-end close, Forecast cycle: a process with its tasks, each after the one before) and *Generate Events with Wizard* (the same event every day, week, month, quarter or year, up to 60).

Statuses: Open, In progress, In review, On hold, Completed, Cancelled, and the flags Overdue (the end has passed and it is not finished) and Delayed (it should have started and has not). Buttons for what the status allows: Start, Submit (needs a reviewer), Approve, Reject, Hold, Resume, Complete, Cancel, Reopen. An event can start after other events; a warning says when it starts before one of them ends.

## Dependencies
An event can start after other events (*Starts after*). The timeline draws a line from the end of the earlier bar into the start of the later one; the line is red when the later event starts before the earlier one ends, and the panel warns about it. When an event is **completed**, the events that waited for it and are still open start by themselves (they become *In progress* and the history says why), as soon as everything they wait for is done or cancelled.

## Approval
A review task is submitted by whoever may edit it and approved or rejected by its **reviewer** (or by the owner of the event; an event without an owner is open to everyone). Approving or rejecting asks for a comment, and a rejection must say why. Every status change is written to the **Activity** list of the event (who, when, what, the comment); the last 50 entries are kept. A rejected task goes back to *In progress*. Chains of reviews are built by letting each review start after the one before it, as the templates do.

## Reminders
In the app only: the Calendar's bell button and the bell in the header count what needs the user's attention today and list it: reviews waiting for them, their overdue and delayed events, events that end within the number of days they chose (3 by default, per event under *Remind the people on it*, or never) and events that start today or tomorrow. A person is involved as reviewer, owner or assignee. Choosing an entry shows the event. There is no e-mail or push: reminders are worked out when a page is opened, because the app has no server job.

## Your own templates
*Save as template* on a process (in its panel) keeps it with the tasks directly inside it: their type, length, place in time relative to the start of the process, what they wait for, and their settings (action, parameters, what a locking task does, reminders, colour). It then appears under *New, Process from Template* next to the built-in ones, and can be deleted from there. The template is stored like an event but is not shown in the calendar, and, like an event, it is private to its creator unless shared.

## Planning tasks
* A **data action task** and a **multi action task** run the action in its run dialog, with the parameters kept in the task (*Parameters*). The result is recorded in the task: completed at 100 percent, or in progress with the message when it failed.
* A **data locking task** locks (or unlocks) a version of a model.
* *Run now* is a button: **nothing runs by itself on the start date**. Running on a schedule needs a server job, which this app does not have.

## People and files
Owners, assignees, viewers (see [sharing-and-security.md](sharing-and-security.md)); work files are stories, datasets, actions of this system or web addresses (http and https only), opened from the panel.

## Data
One table, `ZSAC_CALTASK`, with the event fields (type, parent, dates, progress, people, files, configuration as JSON). The first calendar's fields (due date, assignee, notes) are kept in step so older code and data keep working: an old task shows as a General Task on its due date.

## Panels
Every side panel of the app can be resized by dragging its edge (double-click for the standard width, arrow keys when the edge has focus): the navigation, the story palette and builder, the analyser, the modeller's details, the action designer's flow, the calendar's details and the calendar's list. The widths are kept per panel in the browser.

## What is not in
* **Admin Mode** of SAC (an administrator sees and changes every event): there is no administrator role in this app; an owner who has left is replaced by changing `OWNER_ID` in the table.
* **Data slices in tasks**: a data locking task locks a whole version, not a slice (region, product ...), and a data action task takes the parameters of the action, not a filter of its own.
* **Several owners per event as separate rights**, **notifications by e-mail**, **time of day** (events are whole days) and **running by itself on the start date** (needs a server job).
